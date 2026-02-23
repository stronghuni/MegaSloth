/**
 * Queue-based communication types (inspired by OpenAI Codex CLI)
 * Submission Queue (SQ) / Event Queue (EQ) pattern
 */

export type OpType =
  | 'user_input'
  | 'tool_result'
  | 'approval_response'
  | 'interrupt'
  | 'configure'
  | 'shutdown';

export interface BaseOp {
  id: string;
  type: OpType;
  timestamp: Date;
}

export interface UserInputOp extends BaseOp {
  type: 'user_input';
  payload: {
    text: string;
    attachments?: Array<{
      type: 'file' | 'image' | 'url';
      content: string;
    }>;
  };
}

export interface ToolResultOp extends BaseOp {
  type: 'tool_result';
  payload: {
    callId: string;
    output: string;
    success: boolean;
  };
}

export interface ApprovalResponseOp extends BaseOp {
  type: 'approval_response';
  payload: {
    approvalId: string;
    approved: boolean;
    reason?: string;
  };
}

export interface InterruptOp extends BaseOp {
  type: 'interrupt';
  payload: {
    reason?: string;
  };
}

export interface ConfigureOp extends BaseOp {
  type: 'configure';
  payload: {
    settings: Record<string, unknown>;
  };
}

export interface ShutdownOp extends BaseOp {
  type: 'shutdown';
  payload: Record<string, never>;
}

export type Op =
  | UserInputOp
  | ToolResultOp
  | ApprovalResponseOp
  | InterruptOp
  | ConfigureOp
  | ShutdownOp;

// Event types
export type EventType =
  | 'session_configured'
  | 'turn_started'
  | 'turn_complete'
  | 'turn_aborted'
  | 'content_delta'
  | 'reasoning_delta'
  | 'tool_call_started'
  | 'tool_call_complete'
  | 'approval_request'
  | 'error'
  | 'warning'
  | 'token_usage';

export interface BaseEvent {
  id: string;
  type: EventType;
  submissionId: string;
  timestamp: Date;
}

export interface SessionConfiguredEvent extends BaseEvent {
  type: 'session_configured';
  payload: {
    sessionId: string;
    model: string;
    contextWindow: number;
  };
}

export interface TurnStartedEvent extends BaseEvent {
  type: 'turn_started';
  payload: {
    turnId: string;
    turnNumber: number;
  };
}

export interface TurnCompleteEvent extends BaseEvent {
  type: 'turn_complete';
  payload: {
    turnId: string;
    response: string;
    tokensUsed: {
      input: number;
      output: number;
    };
    toolsExecuted: string[];
  };
}

export interface TurnAbortedEvent extends BaseEvent {
  type: 'turn_aborted';
  payload: {
    turnId: string;
    reason: 'user_interrupt' | 'error' | 'timeout' | 'shutdown';
    message?: string;
  };
}

export interface ContentDeltaEvent extends BaseEvent {
  type: 'content_delta';
  payload: {
    delta: string;
    role: 'assistant';
  };
}

export interface ReasoningDeltaEvent extends BaseEvent {
  type: 'reasoning_delta';
  payload: {
    delta: string;
  };
}

export interface ToolCallStartedEvent extends BaseEvent {
  type: 'tool_call_started';
  payload: {
    callId: string;
    toolName: string;
    args: Record<string, unknown>;
  };
}

export interface ToolCallCompleteEvent extends BaseEvent {
  type: 'tool_call_complete';
  payload: {
    callId: string;
    toolName: string;
    success: boolean;
    output: string;
    duration: number;
  };
}

export interface ApprovalRequestEvent extends BaseEvent {
  type: 'approval_request';
  payload: {
    approvalId: string;
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
  };
}

export interface ErrorEvent extends BaseEvent {
  type: 'error';
  payload: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

export interface WarningEvent extends BaseEvent {
  type: 'warning';
  payload: {
    code: string;
    message: string;
  };
}

export interface TokenUsageEvent extends BaseEvent {
  type: 'token_usage';
  payload: {
    input: number;
    output: number;
    total: number;
    contextWindow: number;
    percentUsed: number;
  };
}

export type AgentEvent =
  | SessionConfiguredEvent
  | TurnStartedEvent
  | TurnCompleteEvent
  | TurnAbortedEvent
  | ContentDeltaEvent
  | ReasoningDeltaEvent
  | ToolCallStartedEvent
  | ToolCallCompleteEvent
  | ApprovalRequestEvent
  | ErrorEvent
  | WarningEvent
  | TokenUsageEvent;
