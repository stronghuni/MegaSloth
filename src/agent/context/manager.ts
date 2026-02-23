/**
 * Context Manager with compaction support
 * Inspired by OpenAI Codex CLI's context management
 */

import { type Message } from '../claude-client.js';

export interface ContextItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    turnId?: string;
    toolCalls?: string[];
    compacted?: boolean;
  };
}

export interface TokenEstimate {
  total: number;
  byRole: {
    system: number;
    user: number;
    assistant: number;
  };
}

// Rough token estimation: ~4 characters per token for English text
const CHARS_PER_TOKEN = 4;

export class ContextManager {
  private items: ContextItem[] = [];
  private systemPrompt: string | null = null;
  private maxContextTokens: number;

  constructor(maxContextTokens: number = 200000) {
    this.maxContextTokens = maxContextTokens;
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  getSystemPrompt(): string | null {
    return this.systemPrompt;
  }

  /**
   * Add a message to context
   */
  addMessage(role: 'user' | 'assistant', content: string, metadata?: ContextItem['metadata']): void {
    this.items.push({
      role,
      content,
      timestamp: new Date(),
      metadata,
    });
  }

  /**
   * Add multiple messages
   */
  addMessages(messages: Array<{ role: 'user' | 'assistant'; content: string }>): void {
    for (const msg of messages) {
      this.addMessage(msg.role, msg.content);
    }
  }

  /**
   * Get all context items
   */
  getItems(): ContextItem[] {
    return [...this.items];
  }

  /**
   * Get items formatted for Claude API
   */
  getMessagesForPrompt(): Message[] {
    return this.items.map((item) => ({
      role: item.role,
      content: item.content,
    }));
  }

  /**
   * Estimate token count
   */
  estimateTokens(): TokenEstimate {
    const estimate: TokenEstimate = {
      total: 0,
      byRole: { system: 0, user: 0, assistant: 0 },
    };

    if (this.systemPrompt) {
      const tokens = Math.ceil(this.systemPrompt.length / CHARS_PER_TOKEN);
      estimate.total += tokens;
      estimate.byRole.system = tokens;
    }

    for (const item of this.items) {
      const tokens = Math.ceil(item.content.length / CHARS_PER_TOKEN);
      estimate.total += tokens;
      estimate.byRole[item.role] += tokens;
    }

    return estimate;
  }

  /**
   * Check if compaction is needed
   */
  needsCompaction(threshold: number = 0.9): boolean {
    const estimate = this.estimateTokens();
    return estimate.total > this.maxContextTokens * threshold;
  }

  /**
   * Get percentage of context used
   */
  getContextUsagePercent(): number {
    const estimate = this.estimateTokens();
    return (estimate.total / this.maxContextTokens) * 100;
  }

  /**
   * Replace context with compacted version
   */
  replaceWithCompacted(summary: string, retainCount: number = 5): void {
    // Keep the most recent messages
    const retained = this.items.slice(-retainCount);

    // Clear and add compaction summary
    this.items = [
      {
        role: 'assistant',
        content: `[Context Summary]\n${summary}\n[End Summary]`,
        timestamp: new Date(),
        metadata: { compacted: true },
      },
      ...retained,
    ];
  }

  /**
   * Get messages for compaction (older messages to summarize)
   */
  getMessagesForCompaction(retainCount: number = 5): ContextItem[] {
    if (this.items.length <= retainCount) {
      return [];
    }
    return this.items.slice(0, -retainCount);
  }

  /**
   * Remove the oldest non-compacted item
   */
  removeOldest(): ContextItem | null {
    const index = this.items.findIndex((item) => !item.metadata?.compacted);
    if (index === -1) {
      return null;
    }
    const removed = this.items.splice(index, 1);
    return removed[0] ?? null;
  }

  /**
   * Clear all context
   */
  clear(): void {
    this.items = [];
  }

  /**
   * Get the last N messages
   */
  getRecentMessages(count: number): ContextItem[] {
    return this.items.slice(-count);
  }

  /**
   * Find messages containing specific text
   */
  findMessages(searchText: string): ContextItem[] {
    const lowerSearch = searchText.toLowerCase();
    return this.items.filter((item) =>
      item.content.toLowerCase().includes(lowerSearch)
    );
  }

  /**
   * Get turn boundaries (user messages)
   */
  getTurnBoundaries(): number[] {
    return this.items
      .map((item, index) => (item.role === 'user' ? index : -1))
      .filter((index) => index !== -1);
  }

  /**
   * Get messages for a specific turn
   */
  getMessagesForTurn(turnId: string): ContextItem[] {
    return this.items.filter((item) => item.metadata?.turnId === turnId);
  }

  /**
   * Serialize context for persistence
   */
  serialize(): string {
    return JSON.stringify({
      systemPrompt: this.systemPrompt,
      items: this.items,
      maxContextTokens: this.maxContextTokens,
    });
  }

  /**
   * Deserialize context from persistence
   */
  static deserialize(data: string): ContextManager {
    const parsed = JSON.parse(data);
    const manager = new ContextManager(parsed.maxContextTokens);
    manager.systemPrompt = parsed.systemPrompt;
    manager.items = parsed.items.map((item: ContextItem) => ({
      ...item,
      timestamp: new Date(item.timestamp),
    }));
    return manager;
  }
}
