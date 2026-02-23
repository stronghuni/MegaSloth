import { type LLMProvider, type Message, type ContentBlock, type ToolDefinition, type LLMProviderConfig } from '../providers/types.js';
import { createLLMProvider } from '../providers/factory.js';
import { ToolRegistry, type ToolContext, createDefaultToolRegistry } from '../tools/registry.js';
import { ContextManager, type ConversationOptions } from './context-manager.js';
import { type GitProviderAdapter, type GitProvider } from '../adapters/git/types.js';
import { GitAdapterFactory, type GitAdapterConfigs } from '../adapters/git/index.js';
import { type MetadataStore } from '../storage/index.js';
import { type AnthropicConfig } from '../config/schema.js';
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
