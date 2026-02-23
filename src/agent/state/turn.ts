/**
 * Turn-scoped state (inspired by OpenAI Codex CLI)
 * Metadata and state for the currently running turn
 */

import { EventEmitter } from 'events';

export interface PendingApproval {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
}

export interface RunningTask {
  id: string;
  name: string;
  startedAt: Date;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  cancellationToken?: AbortController;
}

export interface ToolCallResult {
  callId: string;
  toolName: string;
  success: boolean;
  output: string;
  duration: number;
}

export class TurnState {
  private _pendingApprovals: Map<string, PendingApproval> = new Map();
  private _pendingInput: unknown[] = [];
  private _toolResults: ToolCallResult[] = [];

  insertPendingApproval(approval: PendingApproval): void {
    this._pendingApprovals.set(approval.id, approval);
  }

  removePendingApproval(id: string): PendingApproval | undefined {
    const approval = this._pendingApprovals.get(id);
    this._pendingApprovals.delete(id);
    return approval;
  }

  getPendingApproval(id: string): PendingApproval | undefined {
    return this._pendingApprovals.get(id);
  }

  hasPendingApprovals(): boolean {
    return this._pendingApprovals.size > 0;
  }

  pushPendingInput(input: unknown): void {
    this._pendingInput.push(input);
  }

  takePendingInput(): unknown[] {
    const input = [...this._pendingInput];
    this._pendingInput = [];
    return input;
  }

  hasPendingInput(): boolean {
    return this._pendingInput.length > 0;
  }

  recordToolResult(result: ToolCallResult): void {
    this._toolResults.push(result);
  }

  getToolResults(): ToolCallResult[] {
    return [...this._toolResults];
  }

  clear(): void {
    // Reject all pending approvals
    for (const approval of this._pendingApprovals.values()) {
      approval.reject(new Error('Turn cancelled'));
    }
    this._pendingApprovals.clear();
    this._pendingInput = [];
    this._toolResults = [];
  }
}

export class ActiveTurn {
  readonly id: string;
  readonly startedAt: Date;
  private _tasks: Map<string, RunningTask> = new Map();
  private _turnState: TurnState;
  private _events: EventEmitter;

  constructor(id: string) {
    this.id = id;
    this.startedAt = new Date();
    this._turnState = new TurnState();
    this._events = new EventEmitter();
  }

  get turnState(): TurnState {
    return this._turnState;
  }

  get events(): EventEmitter {
    return this._events;
  }

  addTask(task: RunningTask): void {
    this._tasks.set(task.id, task);
    this._events.emit('task:added', task);
  }

  removeTask(taskId: string): boolean {
    const removed = this._tasks.delete(taskId);
    if (removed) {
      this._events.emit('task:removed', taskId);
    }
    return this._tasks.size === 0;
  }

  getTask(taskId: string): RunningTask | undefined {
    return this._tasks.get(taskId);
  }

  getAllTasks(): RunningTask[] {
    return [...this._tasks.values()];
  }

  cancelAllTasks(): void {
    for (const task of this._tasks.values()) {
      if (task.cancellationToken) {
        task.cancellationToken.abort();
      }
      task.status = 'cancelled';
    }
    this._tasks.clear();
    this._turnState.clear();
    this._events.emit('turn:cancelled');
  }

  /**
   * Calculate turn duration in milliseconds
   */
  getDuration(): number {
    return Date.now() - this.startedAt.getTime();
  }
}
