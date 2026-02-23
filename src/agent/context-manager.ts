import { type Message, type ContentBlock } from './claude-client.js';
import { type MetadataStore, type ConversationContext } from '../storage/index.js';
import { getLogger } from '../utils/logger.js';

export interface ConversationOptions {
  repositoryId?: number;
  pullRequestId?: number;
  contextKey: string;
  maxMessages?: number;
  expirationHours?: number;
}

export class ContextManager {
  private logger = getLogger('context-manager');
  private metadataStore: MetadataStore;
  private inMemoryContexts: Map<string, Message[]> = new Map();

  constructor(metadataStore: MetadataStore) {
    this.metadataStore = metadataStore;
  }

  async getMessages(options: ConversationOptions): Promise<Message[]> {
    // Check in-memory cache first
    const cached = this.inMemoryContexts.get(options.contextKey);
    if (cached) {
      return cached;
    }

    // Try to load from database
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

    // Apply max messages limit
    const maxMessages = options.maxMessages || 50;
    const trimmedMessages = messages.slice(-maxMessages);

    this.inMemoryContexts.set(options.contextKey, trimmedMessages);

    // Persist to database
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
    // The database entry will expire naturally
  }

  private estimateTokenCount(messages: Message[]): number {
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
