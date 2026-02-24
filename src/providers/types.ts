export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMResponse {
  content: ContentBlock[];
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  toolUses: ToolUse[];
  textContent: string;
}

export interface ChatOptions {
  system?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export interface StreamChatOptions extends ChatOptions {
  onText?: (text: string) => void;
  onToolUse?: (toolUse: ToolUse) => void;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  chat(messages: Message[], options?: ChatOptions): Promise<LLMResponse>;
  streamChat(messages: Message[], options?: StreamChatOptions): Promise<LLMResponse>;
  createToolResultMessage(toolUseId: string, result: string, isError?: boolean): ContentBlock;
}

export interface LLMProviderConfig {
  provider: 'claude' | 'openai' | 'gemini';
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-6',
  openai: 'gpt-5.2',
  gemini: 'gemini-3.1-pro-preview',
} as const;
