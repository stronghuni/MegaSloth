import { type Message, type ContentBlock } from './claude-client.js';
import { type LLMProvider } from '../providers/types.js';
import { type MetadataStore } from '../storage/index.js';
import { getLogger } from '../utils/logger.js';

export interface ConversationOptions {
  repositoryId?: number;
  pullRequestId?: number;
  contextKey: string;
  maxMessages?: number;
  expirationHours?: number;
}

export interface CompactionResult {
  summary: string;
  originalTokens: number;
  compactedTokens: number;
  messagesCompacted: number;
}

const COMPACTION_PROMPT = `You are a context summarizer. Create a concise summary of this conversation that preserves:
1. What task(s) the user is trying to accomplish
2. Key decisions made and their rationale
3. Important code changes, file paths, and technical details
4. Current state (what's done, what's pending)
5. Errors encountered and resolutions
6. User preferences or constraints

Preserve specific details: file paths, function names, error messages, config values, git branches.
Use bullet points. Write in the same language as the conversation.

Conversation:
`;

export class ContextManager {
  private logger = getLogger('context-manager');
  private metadataStore: MetadataStore;
  private inMemoryContexts: Map<string, Message[]> = new Map();

  constructor(metadataStore: MetadataStore) {
    this.metadataStore = metadataStore;
  }

  async getMessages(options: ConversationOptions): Promise<Message[]> {
    const cached = this.inMemoryContexts.get(options.contextKey);
    if (cached) {
      return cached;
    }

    const stored = await this.metadataStore.getConversationContext(options.contextKey);
    if (stored) {
      try {
        const messages = JSON.parse(stored.messages as string) as Message[];
        this.inMemoryContexts.set(options.contextKey, messages);
        return messages;
      } catch (error) {
        this.logger.warn({ error, contextKey: options.contextKey }, 'Failed to parse stored context');
      }
    }

    return [];
  }

  async addMessage(options: ConversationOptions, message: Message): Promise<void> {
    const messages = await this.getMessages(options);
    messages.push(message);

    const maxMessages = options.maxMessages || 50;
    const trimmedMessages = messages.slice(-maxMessages);

    this.inMemoryContexts.set(options.contextKey, trimmedMessages);

    const expirationHours = options.expirationHours || 24;
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    await this.metadataStore.upsertConversationContext({
      repositoryId: options.repositoryId,
      pullRequestId: options.pullRequestId,
      contextKey: options.contextKey,
      messages: JSON.stringify(trimmedMessages),
      tokenCount: this.estimateTokenCount(trimmedMessages),
      expiresAt,
    });
  }

  async addMessages(options: ConversationOptions, newMessages: Message[]): Promise<void> {
    for (const message of newMessages) {
      await this.addMessage(options, message);
    }
  }

  async clearContext(contextKey: string): Promise<void> {
    this.inMemoryContexts.delete(contextKey);
  }

  estimateTokenCount(messages: Message[]): number {
    let count = 0;
    for (const message of messages) {
      if (typeof message.content === 'string') {
        count += Math.ceil(message.content.length / 4);
      } else {
        for (const block of message.content) {
          if (block.type === 'text' && block.text) {
            count += Math.ceil(block.text.length / 4);
          } else if (block.type === 'tool_result' && block.content) {
            count += Math.ceil(block.content.length / 4);
          }
        }
      }
    }
    return count;
  }

  needsCompaction(contextKey: string, threshold: number, maxTokens: number): boolean {
    const messages = this.inMemoryContexts.get(contextKey);
    if (!messages) return false;
    const tokens = this.estimateTokenCount(messages);
    return tokens >= maxTokens * threshold;
  }

  async compactContext(
    options: ConversationOptions,
    llmProvider: LLMProvider,
    retainCount = 10
  ): Promise<CompactionResult | null> {
    const messages = await this.getMessages(options);
    if (messages.length <= retainCount + 1) {
      return null;
    }

    const originalTokens = this.estimateTokenCount(messages);
    const toCompact = messages.slice(0, messages.length - retainCount);
    const toRetain = messages.slice(messages.length - retainCount);

    const conversationText = toCompact
      .map(m => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        const text = typeof m.content === 'string'
          ? m.content
          : (m.content as ContentBlock[])
              .filter(b => b.type === 'text' || b.type === 'tool_result')
              .map(b => b.text || b.content || '')
              .join('\n');
        return `${role}: ${text}`;
      })
      .join('\n\n');

    let summary: string;
    try {
      const response = await llmProvider.chat(
        [{ role: 'user', content: COMPACTION_PROMPT + conversationText }],
        { maxTokens: 2000 }
      );
      summary = response.textContent;
    } catch (err) {
      this.logger.warn({ err }, 'Compaction LLM call failed, using fallback');
      summary = conversationText.length > 4000
        ? conversationText.substring(0, 4000) + '\n[...truncated...]'
        : conversationText;
    }

    const compactedMessages: Message[] = [
      { role: 'user', content: `[Previous conversation summary]\n${summary}` },
      { role: 'assistant', content: 'Understood. I have the context from our previous conversation. How can I help you next?' },
      ...toRetain,
    ];

    this.inMemoryContexts.set(options.contextKey, compactedMessages);

    const expirationHours = options.expirationHours || 24;
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
    await this.metadataStore.upsertConversationContext({
      repositoryId: options.repositoryId,
      pullRequestId: options.pullRequestId,
      contextKey: options.contextKey,
      messages: JSON.stringify(compactedMessages),
      tokenCount: this.estimateTokenCount(compactedMessages),
      expiresAt,
    });

    const compactedTokens = this.estimateTokenCount(compactedMessages);

    this.logger.info({
      originalTokens,
      compactedTokens,
      saved: originalTokens - compactedTokens,
      messagesCompacted: toCompact.length,
    }, 'Context compaction completed');

    return {
      summary,
      originalTokens,
      compactedTokens,
      messagesCompacted: toCompact.length,
    };
  }

  createUserMessage(content: string): Message {
    return { role: 'user', content };
  }

  createAssistantMessage(content: string | ContentBlock[]): Message {
    return { role: 'assistant', content };
  }

  createToolResultsMessage(results: Array<{ toolUseId: string; result: string; isError?: boolean }>): Message {
    const content: ContentBlock[] = results.map(r => ({
      type: 'tool_result',
      tool_use_id: r.toolUseId,
      content: r.result,
      is_error: r.isError,
    }));
    return { role: 'user', content };
  }

  async cleanupExpired(): Promise<number> {
    return this.metadataStore.deleteExpiredContexts();
  }

  getContextKey(provider: string, repo: string, type: string, id?: string | number): string {
    const parts = [provider, repo.replace('/', '_'), type];
    if (id !== undefined) {
      parts.push(String(id));
    }
    return parts.join(':');
  }
}
