import Anthropic from '@anthropic-ai/sdk';
import { type AnthropicConfig } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

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

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeResponse {
  content: ContentBlock[];
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  toolUses: ToolUse[];
  textContent: string;
}

export class ClaudeClient {
  private client: Anthropic;
  private config: AnthropicConfig;
  private logger = getLogger('claude-client');

  constructor(config: AnthropicConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async chat(
    messages: Message[],
    options: {
      system?: string;
      tools?: ToolDefinition[];
      maxTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<ClaudeResponse> {
    const startTime = Date.now();

    this.logger.debug({
      messageCount: messages.length,
      hasTools: !!options.tools?.length,
      hasSystem: !!options.system,
    }, 'Sending request to Claude');

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: options.maxTokens || this.config.maxTokens,
      system: options.system,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content as Anthropic.MessageCreateParams['messages'][0]['content'],
      })),
      tools: options.tools as Anthropic.Tool[],
      temperature: options.temperature,
    });

    const durationMs = Date.now() - startTime;

    // Extract tool uses
    const toolUses: ToolUse[] = [];
    let textContent = '';

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        toolUses.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      } else if (block.type === 'text') {
        textContent += block.text;
      }
    }

    this.logger.debug({
      stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      toolUseCount: toolUses.length,
      durationMs,
    }, 'Received response from Claude');

    return {
      content: response.content as ContentBlock[],
      stopReason: response.stop_reason || 'unknown',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      toolUses,
      textContent,
    };
  }

  async streamChat(
    messages: Message[],
    options: {
      system?: string;
      tools?: ToolDefinition[];
      maxTokens?: number;
      temperature?: number;
      onText?: (text: string) => void;
      onToolUse?: (toolUse: ToolUse) => void;
    } = {}
  ): Promise<ClaudeResponse> {
    const stream = await this.client.messages.stream({
      model: this.config.model,
      max_tokens: options.maxTokens || this.config.maxTokens,
      system: options.system,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content as Anthropic.MessageCreateParams['messages'][0]['content'],
      })),
      tools: options.tools as Anthropic.Tool[],
      temperature: options.temperature,
    });

    const toolUses: ToolUse[] = [];
    let textContent = '';
    let currentToolUse: Partial<ToolUse> | null = null;
    let currentToolInput = '';

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolUse = {
            id: event.content_block.id,
            name: event.content_block.name,
          };
          currentToolInput = '';
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          textContent += event.delta.text;
          options.onText?.(event.delta.text);
        } else if (event.delta.type === 'input_json_delta') {
          currentToolInput += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolUse) {
          try {
            currentToolUse.input = JSON.parse(currentToolInput || '{}');
          } catch {
            currentToolUse.input = {};
          }
          const completedToolUse = currentToolUse as ToolUse;
          toolUses.push(completedToolUse);
          options.onToolUse?.(completedToolUse);
          currentToolUse = null;
        }
      }
    }

    const finalMessage = await stream.finalMessage();

    return {
      content: finalMessage.content as ContentBlock[],
      stopReason: finalMessage.stop_reason || 'unknown',
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      },
      toolUses,
      textContent,
    };
  }

  createToolResultMessage(toolUseId: string, result: string, isError = false): ContentBlock {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: result,
      is_error: isError,
    };
  }
}
