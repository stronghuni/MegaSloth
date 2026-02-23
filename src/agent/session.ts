/**
 * Agent Session - Improved agent loop implementation
 * Inspired by OpenAI Codex CLI and Graphiti patterns
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
  type ClaudeClient,
  type Message,
  type ToolUse,
  type ToolDefinition,
} from './claude-client.js';
import { SessionState, type SessionConfiguration } from './state/session.js';
import { ActiveTurn } from './state/turn.js';
import { SubmissionQueue } from './queue/submission.js';
import { EventQueue } from './queue/events.js';
import { type Op, type AgentEvent } from './queue/types.js';
import { ContextManager } from './context/manager.js';
import { CompactionStrategy } from './context/compaction.js';
import { type ToolRegistry, type ToolContext } from '../tools/registry.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('agent-session');

export interface AgentSessionConfig {
  claudeClient: ClaudeClient;
  toolRegistry: ToolRegistry;
  toolContext: ToolContext;
  sessionConfig: SessionConfiguration;
  systemPrompt?: string;
}

export interface AgentSessionDeps {
  // Optional graph memory
  graphStore?: import('../memory/graph/store.js').GraphStore;
  entityExtractor?: import('../memory/extraction/entity.js').EntityExtractor;
}

export class AgentSession extends EventEmitter {
  readonly id: string;
  private claudeClient: ClaudeClient;
  private toolRegistry: ToolRegistry;
  private toolContext: ToolContext;
  private sessionState: SessionState;
  private contextManager: ContextManager;
  private compactionStrategy: CompactionStrategy;
  private submissionQueue: SubmissionQueue;
  private eventQueue: EventQueue;
  private activeTurn: ActiveTurn | null = null;
  private isRunning: boolean = false;
  private deps: AgentSessionDeps;

  constructor(config: AgentSessionConfig, deps: AgentSessionDeps = {}) {
    super();
    this.id = randomUUID();
    this.claudeClient = config.claudeClient;
    this.toolRegistry = config.toolRegistry;
    this.toolContext = config.toolContext;
    this.sessionState = new SessionState(config.sessionConfig);
    this.contextManager = new ContextManager(config.sessionConfig.contextWindow);
    this.compactionStrategy = new CompactionStrategy(config.claudeClient);
    this.submissionQueue = new SubmissionQueue();
    this.eventQueue = new EventQueue();
    this.deps = deps;

    if (config.systemPrompt) {
      this.contextManager.setSystemPrompt(config.systemPrompt);
    }

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.submissionQueue.on('submission', (op: Op) => {
      logger.debug({ opType: op.type, opId: op.id }, 'Received submission');
    });

    this.eventQueue.on('event', (event: AgentEvent) => {
      this.emit('event', event);
    });
  }

  /**
   * Start the agent session
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Session already running');
    }

    this.isRunning = true;
    logger.info({ sessionId: this.id }, 'Starting agent session');

    // Emit session configured event
    this.eventQueue.emitEvent('session_configured', '', {
      sessionId: this.id,
      model: this.sessionState.configuration.model,
      contextWindow: this.sessionState.configuration.contextWindow,
    });

    // Start processing submissions
    this.submissionQueue.startProcessing(async (op) => {
      await this.handleOp(op);
    });
  }

  /**
   * Stop the agent session
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info({ sessionId: this.id }, 'Stopping agent session');

    if (this.activeTurn) {
      this.activeTurn.cancelAllTasks();
      this.activeTurn = null;
    }

    this.submissionQueue.stopProcessing();
    this.isRunning = false;
  }

  /**
   * Submit user input
   */
  async submitUserInput(text: string): Promise<string> {
    return this.submissionQueue.submit('user_input', { text });
  }

  /**
   * Submit tool result
   */
  async submitToolResult(callId: string, output: string, success: boolean): Promise<string> {
    return this.submissionQueue.submit('tool_result', { callId, output, success });
  }

  /**
   * Interrupt current turn
   */
  async interrupt(reason?: string): Promise<string> {
    return this.submissionQueue.submit('interrupt', { reason });
  }

  /**
   * Subscribe to events
   */
  subscribeEvents(callback: (event: AgentEvent) => void): () => void {
    return this.eventQueue.subscribe(callback);
  }

  /**
   * Get event stream
   */
  getEventStream(signal?: AbortSignal): AsyncGenerator<AgentEvent, void, unknown> {
    return this.eventQueue.stream(signal);
  }

  /**
   * Handle incoming operation
   */
  private async handleOp(op: Op): Promise<void> {
    logger.debug({ opType: op.type, opId: op.id }, 'Handling operation');

    try {
      switch (op.type) {
        case 'user_input':
          await this.handleUserInput(op);
          break;
        case 'tool_result':
          await this.handleToolResult(op);
          break;
        case 'interrupt':
          await this.handleInterrupt(op);
          break;
        case 'shutdown':
          await this.stop();
          break;
        default:
          logger.warn({ opType: op.type }, 'Unknown operation type');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, opId: op.id }, 'Operation failed');

      this.eventQueue.emitEvent('error', op.id, {
        code: 'OP_FAILED',
        message: errorMessage,
        recoverable: true,
      });
    }
  }

  /**
   * Handle user input
   */
  private async handleUserInput(op: Op): Promise<void> {
    const { text } = op.payload as { text: string };

    // Add user message to context
    this.contextManager.addMessage('user', text, { turnId: op.id });

    // Ingest to graph memory if available
    if (this.deps.graphStore && this.deps.entityExtractor) {
      const { HybridRetriever } = await import('../memory/retrieval/hybrid.js');
      const retriever = new HybridRetriever(
        this.deps.graphStore,
        this.deps.entityExtractor
      );
      await retriever.ingestEpisode(text, 'user_message', 'User input');
    }

    // Check for compaction
    if (this.compactionStrategy.shouldCompact(this.contextManager)) {
      this.sessionState.setCompacting(true);
      await this.compactionStrategy.compact(this.contextManager);
      this.sessionState.setCompacting(false);
    }

    // Start new turn
    await this.runTurn(op.id);
  }

  /**
   * Handle tool result
   */
  private async handleToolResult(op: Op): Promise<void> {
    const { callId, output, success } = op.payload as {
      callId: string;
      output: string;
      success: boolean;
    };

    if (!this.activeTurn) {
      throw new Error('No active turn to receive tool result');
    }

    this.activeTurn.turnState.recordToolResult({
      callId,
      toolName: '',
      success,
      output,
      duration: 0,
    });

    // Continue the turn with tool result
    await this.continueTurnWithToolResult(op.id, callId, output);
  }

  /**
   * Handle interrupt
   */
  private async handleInterrupt(op: Op): Promise<void> {
    const { reason } = op.payload as { reason?: string };

    if (this.activeTurn) {
      this.activeTurn.cancelAllTasks();

      this.eventQueue.emitEvent('turn_aborted', op.id, {
        turnId: this.activeTurn.id,
        reason: 'user_interrupt',
        message: reason,
      });

      this.activeTurn = null;
    }
  }

  /**
   * Run a turn (agent loop iteration)
   */
  private async runTurn(submissionId: string): Promise<void> {
    const turnId = randomUUID();
    this.activeTurn = new ActiveTurn(turnId);
    const turnNumber = this.sessionState.incrementTurnCount();

    this.eventQueue.emitEvent('turn_started', submissionId, {
      turnId,
      turnNumber,
    });

    try {
      // Build messages for Claude
      const messages = this.contextManager.getMessagesForPrompt();

      // Get relevant context from graph memory
      let additionalContext = '';
      if (this.deps.graphStore && this.deps.entityExtractor) {
        const { HybridRetriever } = await import('../memory/retrieval/hybrid.js');
        const retriever = new HybridRetriever(
          this.deps.graphStore,
          this.deps.entityExtractor
        );
        const lastUserMessage = messages.filter(m => m.role === 'user').pop();
        if (lastUserMessage && typeof lastUserMessage.content === 'string') {
          const context = await retriever.retrieve(lastUserMessage.content);
          additionalContext = context.formattedContext;
        }
      }

      // Build system prompt with context
      let systemPrompt = this.contextManager.getSystemPrompt() || '';
      if (additionalContext) {
        systemPrompt += `\n\n## Relevant Context from Memory\n${additionalContext}`;
      }

      // Make API call with tools
      const tools = this.toolRegistry.getDefinitions();
      const response = await this.claudeClient.chat(messages, {
        system: systemPrompt,
        tools,
        maxTokens: this.sessionState.configuration.maxTokens,
      });

      // Update token usage
      this.sessionState.updateTokenUsage(
        response.usage.inputTokens,
        response.usage.outputTokens
      );

      this.eventQueue.emitEvent('token_usage', submissionId, {
        input: response.usage.inputTokens,
        output: response.usage.outputTokens,
        total: response.usage.inputTokens + response.usage.outputTokens,
        contextWindow: this.sessionState.configuration.contextWindow,
        percentUsed: this.sessionState.tokenUsage?.percentUsed || 0,
      });

      // Emit content delta for text response
      if (response.textContent) {
        this.eventQueue.emitEvent('content_delta', submissionId, {
          delta: response.textContent,
          role: 'assistant',
        });
      }

      // Handle tool calls if present
      if (response.toolUses && response.toolUses.length > 0) {
        await this.handleToolCalls(submissionId, response.toolUses);
        return; // Turn continues after tool execution
      }

      // No tool calls - turn is complete
      this.contextManager.addMessage('assistant', response.textContent, { turnId });

      // Ingest assistant response to graph memory
      if (this.deps.graphStore && this.deps.entityExtractor) {
        const { HybridRetriever } = await import('../memory/retrieval/hybrid.js');
        const retriever = new HybridRetriever(
          this.deps.graphStore,
          this.deps.entityExtractor
        );
        await retriever.ingestEpisode(response.textContent, 'assistant_message', 'Assistant response');
      }

      this.eventQueue.emitEvent('turn_complete', submissionId, {
        turnId,
        response: response.textContent,
        tokensUsed: {
          input: response.usage.inputTokens,
          output: response.usage.outputTokens,
        },
        toolsExecuted: this.activeTurn.turnState.getToolResults().map(r => r.toolName),
      });

      this.activeTurn = null;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, turnId }, 'Turn failed');

      this.eventQueue.emitEvent('turn_aborted', submissionId, {
        turnId,
        reason: 'error',
        message: errorMessage,
      });

      this.activeTurn = null;
    }
  }

  /**
   * Handle tool calls from Claude
   */
  private async handleToolCalls(submissionId: string, toolUses: ToolUse[]): Promise<void> {
    for (const toolUse of toolUses) {
      this.eventQueue.emitEvent('tool_call_started', submissionId, {
        callId: toolUse.id,
        toolName: toolUse.name,
        args: toolUse.input,
      });

      const startTime = Date.now();

      try {
        const result = await this.toolRegistry.execute(toolUse, this.toolContext);
        const duration = Date.now() - startTime;

        this.eventQueue.emitEvent('tool_call_complete', submissionId, {
          callId: toolUse.id,
          toolName: toolUse.name,
          success: !result.isError,
          output: result.result,
          duration,
        });

        this.activeTurn?.turnState.recordToolResult({
          callId: toolUse.id,
          toolName: toolUse.name,
          success: !result.isError,
          output: result.result,
          duration,
        });

        // Ingest tool output to graph memory
        if (this.deps.graphStore && this.deps.entityExtractor) {
          const { HybridRetriever } = await import('../memory/retrieval/hybrid.js');
          const retriever = new HybridRetriever(
            this.deps.graphStore,
            this.deps.entityExtractor
          );
          await retriever.ingestEpisode(
            `Tool: ${toolUse.name}\nInput: ${JSON.stringify(toolUse.input)}\nOutput: ${result.result}`,
            'tool_output',
            `Tool execution: ${toolUse.name}`
          );
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const duration = Date.now() - startTime;

        this.eventQueue.emitEvent('tool_call_complete', submissionId, {
          callId: toolUse.id,
          toolName: toolUse.name,
          success: false,
          output: `Error: ${errorMessage}`,
          duration,
        });
      }
    }

    // Continue turn with tool results
    await this.continueTurnWithToolResults(submissionId);
  }

  /**
   * Continue turn after tool execution
   */
  private async continueTurnWithToolResult(
    submissionId: string,
    callId: string,
    output: string
  ): Promise<void> {
    // Add tool result to context
    this.contextManager.addMessage('user', `[Tool Result for ${callId}]: ${output}`);

    // Continue the turn
    await this.runTurn(submissionId);
  }

  /**
   * Continue turn with all tool results
   */
  private async continueTurnWithToolResults(submissionId: string): Promise<void> {
    if (!this.activeTurn) return;

    const results = this.activeTurn.turnState.getToolResults();
    const resultText = results
      .map((r) => `[Tool: ${r.toolName}]\n${r.output}`)
      .join('\n\n');

    this.contextManager.addMessage('user', resultText);

    // Continue the turn
    await this.runTurn(submissionId);
  }

  /**
   * Get session state
   */
  getState(): SessionState {
    return this.sessionState;
  }

  /**
   * Get context usage info
   */
  getContextUsage(): { percent: number; tokens: number; remaining: number } {
    const estimate = this.contextManager.estimateTokens();
    return {
      percent: this.contextManager.getContextUsagePercent(),
      tokens: estimate.total,
      remaining: this.sessionState.getRemainingTokenBudget(),
    };
  }
}
