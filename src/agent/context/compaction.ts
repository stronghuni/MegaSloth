/**
 * Context Compaction Strategy
 * Automatically summarizes conversation history when approaching context limits
 */

import { type ClaudeClient } from '../claude-client.js';
import { type ContextManager, type ContextItem } from './manager.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('compaction');

export interface CompactionResult {
  summary: string;
  originalTokens: number;
  compactedTokens: number;
  messagesCompacted: number;
  messagesRetained: number;
}

export interface CompactionConfig {
  /** Trigger compaction at this percentage of context usage (default: 0.9) */
  threshold: number;
  /** Number of recent messages to keep uncompacted (default: 10) */
  retainCount: number;
  /** Model to use for summarization (default: claude-3-haiku) */
  summarizationModel: string;
  /** Max tokens for the summary (default: 2000) */
  maxSummaryTokens: number;
}

const DEFAULT_CONFIG: CompactionConfig = {
  threshold: 0.9,
  retainCount: 10,
  summarizationModel: 'claude-3-haiku-20240307',
  maxSummaryTokens: 2000,
};

const COMPACTION_PROMPT = `You are a context summarizer for an AI coding assistant. Your task is to create a concise summary of the conversation history that preserves all important information needed for the assistant to continue helping effectively.

Focus on:
1. What task(s) the user is trying to accomplish
2. Key decisions made and their rationale
3. Important code changes, file paths, and technical details
4. Current state of the work (what's done, what's pending)
5. Any errors encountered and how they were resolved
6. User preferences or constraints mentioned

Create a structured summary that captures the essence of the conversation. Use bullet points for clarity.

Important: Preserve specific details like:
- File paths and names
- Function/class names
- Error messages
- Configuration values
- Git branches or commits mentioned

Conversation to summarize:
`;

export class CompactionStrategy {
  private config: CompactionConfig;
  private claudeClient: ClaudeClient;

  constructor(claudeClient: ClaudeClient, config: Partial<CompactionConfig> = {}) {
    this.claudeClient = claudeClient;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if compaction should be triggered
   */
  shouldCompact(contextManager: ContextManager): boolean {
    return contextManager.needsCompaction(this.config.threshold);
  }

  /**
   * Perform compaction on the context
   */
  async compact(contextManager: ContextManager): Promise<CompactionResult> {
    const originalEstimate = contextManager.estimateTokens();
    const messagesToCompact = contextManager.getMessagesForCompaction(
      this.config.retainCount
    );

    if (messagesToCompact.length === 0) {
      logger.info('No messages to compact');
      return {
        summary: '',
        originalTokens: originalEstimate.total,
        compactedTokens: originalEstimate.total,
        messagesCompacted: 0,
        messagesRetained: contextManager.getItems().length,
      };
    }

    logger.info({
      messagesToCompact: messagesToCompact.length,
      originalTokens: originalEstimate.total,
    }, 'Starting context compaction');

    // Format messages for summarization
    const conversationText = this.formatMessagesForSummary(messagesToCompact);

    // Generate summary using Claude
    const summary = await this.generateSummary(conversationText);

    // Apply compaction
    contextManager.replaceWithCompacted(summary, this.config.retainCount);

    const compactedEstimate = contextManager.estimateTokens();

    const result: CompactionResult = {
      summary,
      originalTokens: originalEstimate.total,
      compactedTokens: compactedEstimate.total,
      messagesCompacted: messagesToCompact.length,
      messagesRetained: contextManager.getItems().length,
    };

    logger.info({
      ...result,
      tokensSaved: originalEstimate.total - compactedEstimate.total,
      reductionPercent: (
        ((originalEstimate.total - compactedEstimate.total) /
          originalEstimate.total) *
        100
      ).toFixed(1),
    }, 'Compaction completed');

    return result;
  }

  /**
   * Format messages for summarization prompt
   */
  private formatMessagesForSummary(items: ContextItem[]): string {
    return items
      .map((item) => {
        const role = item.role === 'user' ? 'User' : 'Assistant';
        const timestamp = item.timestamp.toISOString();
        return `[${timestamp}] ${role}:\n${item.content}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * Generate summary using Claude
   */
  private async generateSummary(conversationText: string): Promise<string> {
    const prompt = COMPACTION_PROMPT + conversationText;

    try {
      const response = await this.claudeClient.chat(
        [{ role: 'user', content: prompt }],
        {
          maxTokens: this.config.maxSummaryTokens,
        }
      );

      return response.textContent;
    } catch (error) {
      logger.error({ error }, 'Failed to generate summary');
      // Fallback: return a simple truncated version
      return this.fallbackSummary(conversationText);
    }
  }

  /**
   * Fallback summary when API call fails
   */
  private fallbackSummary(text: string): string {
    // Simple truncation with ellipsis
    const maxLength = this.config.maxSummaryTokens * 4; // Rough character estimate
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '\n\n[... context truncated due to length ...]';
  }

  /**
   * Estimate potential token savings from compaction
   */
  estimateSavings(contextManager: ContextManager): {
    currentTokens: number;
    estimatedAfterCompaction: number;
    estimatedSavings: number;
  } {
    const current = contextManager.estimateTokens();
    const toCompact = contextManager.getMessagesForCompaction(this.config.retainCount);

    // Estimate that summary will be ~10% of original
    const compactedTokens = toCompact.reduce((sum, item) => {
      return sum + Math.ceil(item.content.length / 4);
    }, 0);

    const estimatedSummaryTokens = Math.ceil(compactedTokens * 0.1);
    const retainedTokens = current.total - compactedTokens;

    return {
      currentTokens: current.total,
      estimatedAfterCompaction: retainedTokens + estimatedSummaryTokens,
      estimatedSavings: compactedTokens - estimatedSummaryTokens,
    };
  }
}
