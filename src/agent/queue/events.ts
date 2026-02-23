/**
 * Event Queue - handles outgoing events to consumers
 * Inspired by OpenAI Codex CLI's event streaming
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { type AgentEvent, type EventType } from './types.js';

export class EventQueue extends EventEmitter {
  private subscribers: Set<(event: AgentEvent) => void> = new Set();
  private eventHistory: AgentEvent[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 1000) {
    super();
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Emit an event to all subscribers
   */
  emitEvent<T extends EventType>(
    type: T,
    submissionId: string,
    payload: unknown
  ): AgentEvent {
    const event = {
      id: randomUUID(),
      type,
      submissionId,
      timestamp: new Date(),
      payload,
    } as AgentEvent;

    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify subscribers
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (error) {
        this.emit('subscriber:error', { subscriber, error, event });
      }
    }

    // Also emit via EventEmitter for internal use
    this.emit('event', event);
    this.emit(type, event);

    return event;
  }

  /**
   * Subscribe to events
   */
  subscribe(callback: (event: AgentEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get event history
   */
  getHistory(limit?: number): AgentEvent[] {
    if (limit) {
      return this.eventHistory.slice(-limit);
    }
    return [...this.eventHistory];
  }

  /**
   * Get events by submission ID
   */
  getEventsBySubmission(submissionId: string): AgentEvent[] {
    return this.eventHistory.filter((e) => e.submissionId === submissionId);
  }

  /**
   * Get events by type
   */
  getEventsByType(type: EventType): AgentEvent[] {
    return this.eventHistory.filter((e) => e.type === type);
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Create an async iterator for events
   */
  async *stream(
    signal?: AbortSignal
  ): AsyncGenerator<AgentEvent, void, unknown> {
    const queue: AgentEvent[] = [];
    let resolveNext: ((value: AgentEvent | null) => void) | null = null;

    const handler = (event: AgentEvent) => {
      if (resolveNext) {
        resolveNext(event);
        resolveNext = null;
      } else {
        queue.push(event);
      }
    };

    const unsubscribe = this.subscribe(handler);
    const onAbort = () => {
      if (resolveNext) {
        resolveNext(null);
      }
    };
    signal?.addEventListener('abort', onAbort);

    try {
      while (!signal?.aborted) {
        const event =
          queue.shift() ??
          (await new Promise<AgentEvent | null>((resolve) => {
            resolveNext = resolve;
          }));

        if (event === null) {
          break;
        }

        yield event;
      }
    } finally {
      unsubscribe();
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Get subscriber count
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }
}
