/**
 * Submission Queue - handles incoming operations
 * Inspired by OpenAI Codex CLI's queue-based architecture
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { type Op, type OpType } from './types.js';

const DEFAULT_CAPACITY = 64;

export class SubmissionQueue extends EventEmitter {
  private queue: Op[] = [];
  private capacity: number;
  private processing: boolean = false;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    super();
    this.capacity = capacity;
  }

  /**
   * Submit an operation to the queue
   */
  async submit(type: OpType, payload: unknown): Promise<string> {
    if (this.queue.length >= this.capacity) {
      throw new Error('Submission queue is full');
    }

    const op: Op = {
      id: randomUUID(),
      type,
      payload,
      timestamp: new Date(),
    } as Op;

    this.queue.push(op);
    this.emit('submission', op);

    return op.id;
  }

  /**
   * Take the next operation from the queue
   */
  async take(): Promise<Op | null> {
    return this.queue.shift() || null;
  }

  /**
   * Peek at the next operation without removing it
   */
  peek(): Op | null {
    return this.queue[0] || null;
  }

  /**
   * Check if there are pending operations
   */
  hasPending(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Get the number of pending operations
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Clear all pending operations
   */
  clear(): void {
    const cleared = [...this.queue];
    this.queue = [];
    this.emit('cleared', cleared);
  }

  /**
   * Start processing the queue
   */
  async startProcessing(handler: (op: Op) => Promise<void>): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    this.emit('processing:started');

    try {
      while (this.processing) {
        const op = await this.take();
        if (!op) {
          // Wait for new submissions
          await new Promise<void>((resolve) => {
            const onSubmission = () => {
              this.off('submission', onSubmission);
              this.off('stop', onStop);
              resolve();
            };
            const onStop = () => {
              this.off('submission', onSubmission);
              this.off('stop', onStop);
              resolve();
            };
            this.once('submission', onSubmission);
            this.once('stop', onStop);
          });
          continue;
        }

        try {
          await handler(op);
          this.emit('processed', op);
        } catch (error) {
          this.emit('error', { op, error });
        }
      }
    } finally {
      this.processing = false;
      this.emit('processing:stopped');
    }
  }

  /**
   * Stop processing the queue
   */
  stopProcessing(): void {
    this.processing = false;
    this.emit('stop');
  }

  /**
   * Check if the queue is currently processing
   */
  isProcessing(): boolean {
    return this.processing;
  }
}
