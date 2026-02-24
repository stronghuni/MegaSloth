import Anthropic from '@anthropic-ai/sdk';
import {
  type LLMProvider,
  type LLMProviderConfig,
  type Message,
  type ChatOptions,
  type StreamChatOptions,
  type LLMResponse,
  type ContentBlock,
  type ToolUse,
  DEFAULT_MODELS,
} from './types.js';
import { getLogger } from '../utils/logger.js';

export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude';
  readonly model: string;
  private client: Anthropic;
  private maxTokens: number;
  private logger = getLogger('claude-provider');

  constructor(config: LLMProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model || DEFAULT_MODELS.claude!;
    this.maxTokens = config.maxTokens ?? 8192;
  }

  async chat(messages: Message[], options: ChatOptions = {}): Promise<LLMResponse> {
    const startTime = Date.now();

    this.logger.debug({
      messageCount: messages.length,
      hasTools: !!options.tools?.length,
    }, 'Sending request to Claude');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens || this.maxTokens,
      system: options.system,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content as Anthropic.MessageCreateParams['messages'][0]['content'],
      })),
      tools: options.tools as Anthropic.Tool[],
      temperature: options.temperature,
    });

    const durationMs = Date.now() - startTime;
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
    }, 'Claude response received');

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

  async streamChat(messages: Message[], options: StreamChatOptions = {}): Promise<LLMResponse> {
    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: options.maxTokens || this.maxTokens,
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
