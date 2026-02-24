import { getLogger } from '../utils/logger.js';

export interface GuardrailConfig {
  maxToolCalls: number;
  toolTimeoutMs: number;
  sessionTimeoutMs: number;
  maxRetries: number;
  compactionThreshold: number;
  maxContextTokens: number;
}

const DEFAULT_CONFIG: GuardrailConfig = {
  maxToolCalls: 50,
  toolTimeoutMs: 30_000,
  sessionTimeoutMs: 600_000,
  maxRetries: 3,
  compactionThreshold: 0.9,
  maxContextTokens: 100_000,
};

interface ToolCallRecord {
  tool: string;
  inputHash: string;
  timestamp: number;
}

export interface GuardrailCheckResult {
  allowed: boolean;
  reason?: string;
  shouldCompact?: boolean;
}

export class Guardrails {
  private config: GuardrailConfig;
  private logger = getLogger('guardrails');
  private toolCallCount = 0;
  private sessionStartTime: number;
  private recentCalls: ToolCallRecord[] = [];
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

  constructor(config?: Partial<GuardrailConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionStartTime = Date.now();
  }

  checkBudget(): GuardrailCheckResult {
    if (this.toolCallCount >= this.config.maxToolCalls) {
      this.logger.warn(
        { count: this.toolCallCount, max: this.config.maxToolCalls },
        'Tool call budget exceeded'
      );
      return {
        allowed: false,
        reason: `Tool call budget exceeded (${this.toolCallCount}/${this.config.maxToolCalls})`,
      };
    }
    return { allowed: true };
  }

  checkSessionTimeout(): GuardrailCheckResult {
    const elapsed = Date.now() - this.sessionStartTime;
    if (elapsed >= this.config.sessionTimeoutMs) {
      this.logger.warn(
        { elapsedMs: elapsed, timeoutMs: this.config.sessionTimeoutMs },
        'Session timeout'
      );
      return {
        allowed: false,
        reason: `Session timeout (${Math.round(elapsed / 1000)}s / ${Math.round(this.config.sessionTimeoutMs / 1000)}s)`,
      };
    }
    return { allowed: true };
  }

  detectLoop(toolName: string, input: Record<string, unknown>): GuardrailCheckResult {
    const inputHash = this.hashInput(input);
    const now = Date.now();

    const windowMs = 60_000;
    this.recentCalls = this.recentCalls.filter(c => now - c.timestamp < windowMs);

    const duplicates = this.recentCalls.filter(
      c => c.tool === toolName && c.inputHash === inputHash
    );

    if (duplicates.length >= this.config.maxRetries) {
      this.logger.warn(
        { toolName, duplicates: duplicates.length, maxRetries: this.config.maxRetries },
        'Loop detected: same tool+input repeated'
      );
      return {
        allowed: false,
        reason: `Loop detected: ${toolName} called ${duplicates.length + 1} times with same input`,
      };
    }

    this.recentCalls.push({ tool: toolName, inputHash, timestamp: now });
    return { allowed: true };
  }

  checkAll(toolName: string, input: Record<string, unknown>): GuardrailCheckResult {
    const budgetCheck = this.checkBudget();
    if (!budgetCheck.allowed) return budgetCheck;

    const timeoutCheck = this.checkSessionTimeout();
    if (!timeoutCheck.allowed) return timeoutCheck;

    const loopCheck = this.detectLoop(toolName, input);
    if (!loopCheck.allowed) return loopCheck;

    return { allowed: true };
  }

  recordToolCall(): void {
    this.toolCallCount++;
  }

  recordTokenUsage(input: number, output: number): void {
    this.totalInputTokens += input;
    this.totalOutputTokens += output;
  }

  shouldCompact(currentTokens: number): boolean {
    return currentTokens >= this.config.maxContextTokens * this.config.compactionThreshold;
  }

  getStats(): {
    toolCallCount: number;
    elapsedMs: number;
    totalTokens: number;
    remainingBudget: number;
  } {
    return {
      toolCallCount: this.toolCallCount,
      elapsedMs: Date.now() - this.sessionStartTime,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      remainingBudget: this.config.maxToolCalls - this.toolCallCount,
    };
  }

  reset(): void {
    this.toolCallCount = 0;
    this.sessionStartTime = Date.now();
    this.recentCalls = [];
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }

  getToolTimeoutMs(): number {
    return this.config.toolTimeoutMs;
  }

  private hashInput(input: Record<string, unknown>): string {
    try {
      const sorted = JSON.stringify(input, Object.keys(input).sort());
      let hash = 0;
      for (let i = 0; i < sorted.length; i++) {
        const char = sorted.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
      }
      return String(hash);
    } catch {
      return String(Date.now());
    }
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: ${label} exceeded ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
