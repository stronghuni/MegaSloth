/**
 * Session-wide mutable state (inspired by OpenAI Codex CLI)
 * Persistent state that lives for the entire session lifecycle
 */

import { type GitProvider } from '../../adapters/git/types.js';

export interface TokenUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextWindow: number;
  percentUsed: number;
}

export interface RateLimitSnapshot {
  requestsRemaining: number;
  tokensRemaining: number;
  resetAt?: Date;
}

export interface SessionConfiguration {
  provider: GitProvider;
  owner: string;
  repo: string;
  model: string;
  maxTokens: number;
  contextWindow: number;
}

export class SessionState {
  private _configuration: SessionConfiguration;
  private _tokenUsage: TokenUsageInfo | null = null;
  private _rateLimits: RateLimitSnapshot | null = null;
  private _turnCount: number = 0;
  private _dependencies: Map<string, string> = new Map();
  private _isCompacting: boolean = false;

  constructor(configuration: SessionConfiguration) {
    this._configuration = configuration;
  }

  get configuration(): SessionConfiguration {
    return this._configuration;
  }

  get tokenUsage(): TokenUsageInfo | null {
    return this._tokenUsage;
  }

  get rateLimits(): RateLimitSnapshot | null {
    return this._rateLimits;
  }

  get turnCount(): number {
    return this._turnCount;
  }

  get isCompacting(): boolean {
    return this._isCompacting;
  }

  updateTokenUsage(input: number, output: number): void {
    const total = input + output;
    this._tokenUsage = {
      inputTokens: input,
      outputTokens: output,
      totalTokens: total,
      contextWindow: this._configuration.contextWindow,
      percentUsed: (total / this._configuration.contextWindow) * 100,
    };
  }

  updateRateLimits(snapshot: RateLimitSnapshot): void {
    this._rateLimits = {
      ...this._rateLimits,
      ...snapshot,
    };
  }

  incrementTurnCount(): number {
    return ++this._turnCount;
  }

  setDependency(key: string, value: string): void {
    this._dependencies.set(key, value);
  }

  getDependency(key: string): string | undefined {
    return this._dependencies.get(key);
  }

  getAllDependencies(): Map<string, string> {
    return new Map(this._dependencies);
  }

  setCompacting(value: boolean): void {
    this._isCompacting = value;
  }

  /**
   * Check if context compaction should be triggered
   * Triggers at 90% of context window usage
   */
  shouldCompact(): boolean {
    if (!this._tokenUsage || this._isCompacting) {
      return false;
    }
    return this._tokenUsage.percentUsed >= 90;
  }

  /**
   * Calculate remaining context budget
   */
  getRemainingTokenBudget(): number {
    if (!this._tokenUsage) {
      return this._configuration.contextWindow;
    }
    return this._configuration.contextWindow - this._tokenUsage.totalTokens;
  }
}
