import { type LLMProvider, type Message, type LLMProviderConfig, type ContentBlock } from '../providers/types.js';
import { createLLMProvider } from '../providers/factory.js';
import { ToolRegistry, type ToolContext, createDefaultToolRegistry } from '../tools/registry.js';
import { ContextManager, type ConversationOptions } from './context-manager.js';
import { type GitProviderAdapter, type GitProvider } from '../adapters/git/types.js';
import { GitAdapterFactory, type GitAdapterConfigs } from '../adapters/git/index.js';
import { type MetadataStore } from '../storage/index.js';
import { type AnthropicConfig } from '../config/schema.js';
import { getHookEngine } from './hooks.js';
import { Guardrails, withTimeout, type GuardrailConfig } from './guardrails.js';
import { getLogger } from '../utils/logger.js';

export interface AgentTask {
  id: string;
  provider: GitProvider;
  owner: string;
  repo: string;
  prNumber?: number;
  skillName?: string;
  systemPrompt: string;
  userPrompt: string;
  tools?: string[];
  maxTurns?: number;
}

export interface ChatTask {
  sessionId: string;
  message: string;
  systemPrompt?: string;
  toolCategories?: string[];
  maxTurns?: number;
  guardrailConfig?: Partial<GuardrailConfig>;
}

export interface AgentEventCallbacks {
  onTextDelta?: (text: string) => void;
  onToolStart?: (tool: string, input: Record<string, unknown>) => void;
  onToolDone?: (tool: string, result: string, durationMs: number, isError: boolean) => void;
  onToolBlocked?: (tool: string, reason: string) => void;
  onTurnComplete?: (turn: number, tokenUsage: { input: number; output: number }) => void;
  onError?: (error: string) => void;
  onDone?: (result: AgentResult) => void;
}

export interface AgentResult {
  taskId: string;
  success: boolean;
  response: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  toolsExecuted: string[];
  turns: number;
  error?: string;
}

export interface AgentCoreDeps {
  anthropicConfig?: AnthropicConfig;
  llmConfig?: LLMProviderConfig;
  gitAdapterConfigs: GitAdapterConfigs;
  metadataStore: MetadataStore;
}

export class AgentCore {
  private llm: LLMProvider;
  private toolRegistry: ToolRegistry;
  private contextManager: ContextManager;
  private gitAdapterFactory: GitAdapterFactory;
  private logger = getLogger('agent-core');

  constructor(deps: AgentCoreDeps) {
    if (deps.llmConfig) {
      this.llm = createLLMProvider(deps.llmConfig);
    } else if (deps.anthropicConfig) {
      this.llm = createLLMProvider({
        provider: 'claude',
        apiKey: deps.anthropicConfig.apiKey,
        model: deps.anthropicConfig.model,
        maxTokens: deps.anthropicConfig.maxTokens,
      });
    } else {
      throw new Error('Either llmConfig or anthropicConfig must be provided');
    }
    this.toolRegistry = createDefaultToolRegistry();
    this.contextManager = new ContextManager(deps.metadataStore);
    this.gitAdapterFactory = new GitAdapterFactory(deps.gitAdapterConfigs);
  }

  async executeTask(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.logger.info({
      taskId: task.id,
      provider: task.provider,
      repo: `${task.owner}/${task.repo}`,
      prNumber: task.prNumber,
      skillName: task.skillName,
    }, 'Starting agent task');

    const gitAdapter = this.gitAdapterFactory.getOrThrow(task.provider);

    const toolContext: ToolContext = {
      gitAdapter,
      owner: task.owner,
      repo: task.repo,
      prNumber: task.prNumber,
    };

    // Get tool definitions based on requested categories
    const toolCategories = task.tools || ['git', 'pr', 'ci', 'issue', 'code', 'release'];
    const tools = this.toolRegistry.getDefinitions(toolCategories);

    // Context options for conversation history
    const contextOptions: ConversationOptions = {
      contextKey: this.contextManager.getContextKey(
        task.provider,
        `${task.owner}/${task.repo}`,
        task.skillName || 'task',
        task.prNumber || task.id
      ),
      maxMessages: 30,
      expirationHours: 24,
    };

    // Initialize or get existing conversation
    const existingMessages = await this.contextManager.getMessages(contextOptions);
    const messages: Message[] = [...existingMessages];

    // Add initial user message
    messages.push(this.contextManager.createUserMessage(task.userPrompt));

    const toolsExecuted: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let turns = 0;
    const maxTurns = task.maxTurns || 10;

    try {
      while (turns < maxTurns) {
        turns++;

        const response = await this.llm.chat(messages, {
          system: task.systemPrompt,
          tools,
        });

        totalInputTokens += response.usage.inputTokens;
        totalOutputTokens += response.usage.outputTokens;

        // Add assistant response to messages
        messages.push(this.contextManager.createAssistantMessage(response.content));

        // If no tool uses, we're done
        if (response.toolUses.length === 0 || response.stopReason === 'end_turn') {
          await this.contextManager.addMessages(contextOptions, messages.slice(existingMessages.length));

          const durationMs = Date.now() - startTime;
          this.logger.info({
            taskId: task.id,
            turns,
            toolsExecuted: toolsExecuted.length,
            tokensUsed: totalInputTokens + totalOutputTokens,
            durationMs,
          }, 'Agent task completed');

          return {
            taskId: task.id,
            success: true,
            response: response.textContent,
            tokensUsed: {
              input: totalInputTokens,
              output: totalOutputTokens,
            },
            toolsExecuted,
            turns,
          };
        }

        // Execute tools
        const toolResults: Array<{ toolUseId: string; result: string; isError: boolean }> = [];

        for (const toolUse of response.toolUses) {
          toolsExecuted.push(toolUse.name);
          const { result, isError } = await this.toolRegistry.execute(toolUse, toolContext);
          toolResults.push({
            toolUseId: toolUse.id,
            result,
            isError,
          });
        }

        // Add tool results to messages
        messages.push(this.contextManager.createToolResultsMessage(toolResults));
      }

      // Max turns reached
      const durationMs = Date.now() - startTime;
      this.logger.warn({
        taskId: task.id,
        turns,
        maxTurns,
        durationMs,
      }, 'Agent task reached max turns');

      await this.contextManager.addMessages(contextOptions, messages.slice(existingMessages.length));

      return {
        taskId: task.id,
        success: true,
        response: 'Task reached maximum number of turns',
        tokensUsed: {
          input: totalInputTokens,
          output: totalOutputTokens,
        },
        toolsExecuted,
        turns,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;

      this.logger.error({
        taskId: task.id,
        error: errorMessage,
        turns,
        durationMs,
      }, 'Agent task failed');

      return {
        taskId: task.id,
        success: false,
        response: '',
        tokensUsed: {
          input: totalInputTokens,
          output: totalOutputTokens,
        },
        toolsExecuted,
        turns,
        error: errorMessage,
      };
    }
  }

  async executeChatTask(
    task: ChatTask,
    callbacks: AgentEventCallbacks = {}
  ): Promise<AgentResult> {
    const hookEngine = getHookEngine();
    const guardrails = new Guardrails(task.guardrailConfig);

    this.logger.info({ sessionId: task.sessionId }, 'Starting chat task');

    await hookEngine.runSessionStart(task.sessionId);

    const toolCategories = task.toolCategories || [
      'shell', 'filesystem', 'code', 'git', 'web', 'memory', 'session',
    ];
    const tools = this.toolRegistry.getDefinitions(toolCategories);

    const contextOptions: ConversationOptions = {
      contextKey: `chat:${task.sessionId}`,
      maxMessages: 100,
      expirationHours: 48,
    };

    const existingMessages = await this.contextManager.getMessages(contextOptions);
    const messages: Message[] = [...existingMessages];
    messages.push({ role: 'user', content: task.message });

    const toolsExecuted: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let turns = 0;
    const maxTurns = task.maxTurns || 15;
    let lastTextResponse = '';

    const systemPrompt = task.systemPrompt || this.getDefaultChatSystemPrompt();

    const toolContext: ToolContext = this.createLocalToolContext();

    try {
      while (turns < maxTurns) {
        turns++;

        const timeoutCheck = guardrails.checkSessionTimeout();
        if (!timeoutCheck.allowed) {
          callbacks.onError?.(timeoutCheck.reason!);
          break;
        }

        const response = await this.llm.streamChat(messages, {
          system: systemPrompt,
          tools,
          onText: (text) => {
            lastTextResponse += text;
            callbacks.onTextDelta?.(text);
          },
          onToolUse: (toolUse) => {
            this.logger.debug({ tool: toolUse.name }, 'LLM requested tool');
          },
        });

        totalInputTokens += response.usage.inputTokens;
        totalOutputTokens += response.usage.outputTokens;
        guardrails.recordTokenUsage(response.usage.inputTokens, response.usage.outputTokens);

        callbacks.onTurnComplete?.(turns, { input: response.usage.inputTokens, output: response.usage.outputTokens });

        messages.push({ role: 'assistant', content: response.content });

        if (response.toolUses.length === 0 || response.stopReason === 'end_turn') {
          break;
        }

        const toolResults: Array<{ toolUseId: string; result: string; isError: boolean }> = [];

        for (const toolUse of response.toolUses) {
          const budgetCheck = guardrails.checkAll(toolUse.name, toolUse.input);
          if (!budgetCheck.allowed) {
            callbacks.onToolBlocked?.(toolUse.name, budgetCheck.reason!);
            toolResults.push({
              toolUseId: toolUse.id,
              result: `Blocked: ${budgetCheck.reason}`,
              isError: true,
            });
            continue;
          }

          const hookResult = await hookEngine.runPreToolUse(toolUse.name, toolUse.input);
          if (hookResult.decision === 'deny') {
            callbacks.onToolBlocked?.(toolUse.name, hookResult.reason || 'Blocked by hook');
            toolResults.push({
              toolUseId: toolUse.id,
              result: `Blocked: ${hookResult.reason}`,
              isError: true,
            });
            continue;
          }

          callbacks.onToolStart?.(toolUse.name, toolUse.input);
          const toolStartTime = Date.now();

          try {
            const { result, isError } = await withTimeout(
              this.toolRegistry.execute(toolUse, toolContext),
              guardrails.getToolTimeoutMs(),
              `tool:${toolUse.name}`
            );

            const durationMs = Date.now() - toolStartTime;
            toolsExecuted.push(toolUse.name);
            guardrails.recordToolCall();

            callbacks.onToolDone?.(toolUse.name, result.substring(0, 500), durationMs, isError);

            await hookEngine.runPostToolUse(toolUse.name, toolUse.input, { result, isError });

            toolResults.push({ toolUseId: toolUse.id, result, isError });
          } catch (err) {
            const durationMs = Date.now() - toolStartTime;
            const errorMsg = err instanceof Error ? err.message : String(err);
            callbacks.onToolDone?.(toolUse.name, errorMsg, durationMs, true);
            toolResults.push({ toolUseId: toolUse.id, result: `Error: ${errorMsg}`, isError: true });
          }
        }

        const toolResultContent: ContentBlock[] = toolResults.map(r => ({
          type: 'tool_result' as const,
          tool_use_id: r.toolUseId,
          content: r.result,
          is_error: r.isError,
        }));
        messages.push({ role: 'user', content: toolResultContent });

        lastTextResponse = '';
      }

      await this.contextManager.addMessages(contextOptions, messages.slice(existingMessages.length));

      await hookEngine.runSessionEnd(task.sessionId);

      const result: AgentResult = {
        taskId: task.sessionId,
        success: true,
        response: lastTextResponse || this.extractTextFromMessages(messages),
        tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
        toolsExecuted,
        turns,
      };

      callbacks.onDone?.(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ sessionId: task.sessionId, error: errorMessage }, 'Chat task failed');
      callbacks.onError?.(errorMessage);

      await hookEngine.runSessionEnd(task.sessionId);

      const result: AgentResult = {
        taskId: task.sessionId,
        success: false,
        response: '',
        tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
        toolsExecuted,
        turns,
        error: errorMessage,
      };
      callbacks.onDone?.(result);
      return result;
    }
  }

  async clearChatSession(sessionId: string): Promise<void> {
    await this.contextManager.clearContext(`chat:${sessionId}`);
  }

  private createLocalToolContext(): ToolContext {
    const providers = this.gitAdapterFactory.listProviders();
    const firstProvider = providers[0];

    if (firstProvider) {
      const adapter = this.gitAdapterFactory.getOrThrow(firstProvider);
      return { gitAdapter: adapter, owner: '', repo: '' };
    }

    const noopAdapter = {
      getRepository: async () => ({ name: '', fullName: '', defaultBranch: 'main', url: '', isPrivate: false }),
      listBranches: async () => [],
      compareBranches: async () => ({ ahead: 0, behind: 0, files: [] }),
    } as unknown as GitProviderAdapter;

    return { gitAdapter: noopAdapter, owner: '', repo: '' };
  }

  private getDefaultChatSystemPrompt(): string {
    return `You are MegaSloth, an AI-powered DevOps automation agent. You have access to tools for:
- Shell commands and filesystem operations
- Git repository management
- Code reading and modification
- Web requests and browsing
- Memory and session management

When the user asks you to perform tasks, use the available tools to help them.
Be concise and precise. Execute tasks step by step, explaining what you're doing.
If a task requires multiple steps, plan first then execute.
Always respond in Korean unless asked otherwise.`;
  }

  private extractTextFromMessages(messages: Message[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]!;
      if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') return msg.content;
        const textBlocks = (msg.content as ContentBlock[]).filter(b => b.type === 'text');
        return textBlocks.map(b => b.text || '').join('');
      }
    }
    return '';
  }

  async executeSimplePrompt(
    provider: GitProvider,
    owner: string,
    repo: string,
    systemPrompt: string,
    userPrompt: string,
    options?: {
      prNumber?: number;
      tools?: string[];
    }
  ): Promise<AgentResult> {
    return this.executeTask({
      id: `simple-${Date.now()}`,
      provider,
      owner,
      repo,
      prNumber: options?.prNumber,
      systemPrompt,
      userPrompt,
      tools: options?.tools,
    });
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  getLLMProvider(): LLMProvider {
    return this.llm;
  }

  getGitAdapter(provider: GitProvider): GitProviderAdapter {
    return this.gitAdapterFactory.getOrThrow(provider);
  }

  hasProvider(provider: GitProvider): boolean {
    return this.gitAdapterFactory.has(provider);
  }

  listProviders(): GitProvider[] {
    return this.gitAdapterFactory.listProviders();
  }
}

export function createAgentCore(deps: AgentCoreDeps): AgentCore {
  return new AgentCore(deps);
}
