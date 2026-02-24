import OpenAI from 'openai';
import {
  type LLMProvider,
  type LLMProviderConfig,
  type Message,
  type ChatOptions,
  type StreamChatOptions,
  type LLMResponse,
  type ContentBlock,
  type ToolDefinition,
  type ToolUse,
  DEFAULT_MODELS,
} from './types.js';
import { getLogger } from '../utils/logger.js';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly model: string;
  private client: OpenAI;
  private maxTokens: number;
  private logger = getLogger('openai-provider');

  constructor(config: LLMProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || DEFAULT_MODELS.openai!;
    this.maxTokens = config.maxTokens ?? 8192;
  }

  private convertToolsToFunctions(tools?: ToolDefinition[]): OpenAI.ChatCompletionTool[] | undefined {
    if (!tools?.length) return undefined;
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  private convertMessages(messages: Message[], system?: string): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    if (system) {
      result.push({ role: 'system', content: system });
    }

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
        continue;
      }

      if (msg.role === 'user') {
        const toolResults = msg.content.filter(b => b.type === 'tool_result');
        if (toolResults.length > 0) {
          for (const tr of toolResults) {
            result.push({
              role: 'tool',
              tool_call_id: tr.tool_use_id!,
              content: tr.content || '',
            });
          }
          continue;
        }
        const textParts = msg.content.filter(b => b.type === 'text');
        if (textParts.length > 0) {
          result.push({ role: 'user', content: textParts.map(t => t.text).join('\n') });
        }
      } else if (msg.role === 'assistant') {
        const textParts = msg.content.filter(b => b.type === 'text');
        const toolUseParts = msg.content.filter(b => b.type === 'tool_use');

        const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: textParts.map(t => t.text).join('\n') || null,
        };

        if (toolUseParts.length > 0) {
          assistantMsg.tool_calls = toolUseParts.map(tu => ({
            id: tu.id!,
            type: 'function' as const,
            function: {
              name: tu.name!,
              arguments: JSON.stringify(tu.input || {}),
            },
          }));
        }

        result.push(assistantMsg);
      }
    }

    return result;
  }

  async chat(messages: Message[], options: ChatOptions = {}): Promise<LLMResponse> {
    const startTime = Date.now();

    this.logger.debug({
      messageCount: messages.length,
      hasTools: !!options.tools?.length,
    }, 'Sending request to OpenAI');

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options.maxTokens || this.maxTokens,
      messages: this.convertMessages(messages, options.system),
      tools: this.convertToolsToFunctions(options.tools),
      temperature: options.temperature,
    });

    const durationMs = Date.now() - startTime;
    const choice = response.choices[0]!;
    const toolUses: ToolUse[] = [];
    const content: ContentBlock[] = [];
    let textContent = '';

    if (choice.message.content) {
      textContent = choice.message.content;
      content.push({ type: 'text', text: textContent });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type !== 'function') continue;
        const fn = (tc as { type: 'function'; id: string; function: { name: string; arguments: string } }).function;
        let parsedInput: Record<string, unknown> = {};
        try {
          parsedInput = JSON.parse(fn.arguments);
        } catch { /* empty */ }

        const toolUse: ToolUse = {
          id: tc.id,
          name: fn.name,
          input: parsedInput,
        };
        toolUses.push(toolUse);
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: fn.name,
          input: parsedInput,
        });
      }
    }

    const stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn';

    this.logger.debug({
      stopReason,
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      toolUseCount: toolUses.length,
      durationMs,
    }, 'OpenAI response received');

    return {
      content,
      stopReason,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
      toolUses,
      textContent,
    };
  }

  async streamChat(messages: Message[], options: StreamChatOptions = {}): Promise<LLMResponse> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options.maxTokens || this.maxTokens,
      messages: this.convertMessages(messages, options.system),
      tools: this.convertToolsToFunctions(options.tools),
      temperature: options.temperature,
      stream: true,
    });

    const toolCalls = new Map<number, { id: string; name: string; args: string }>();
    let textContent = '';
    const content: ContentBlock[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        textContent += delta.content;
        options.onText?.(delta.content);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCalls.has(tc.index)) {
            toolCalls.set(tc.index, { id: tc.id || '', name: tc.function?.name || '', args: '' });
          }
          const existing = toolCalls.get(tc.index)!;
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
        }
      }
    }

    if (textContent) {
      content.push({ type: 'text', text: textContent });
    }

    const toolUses: ToolUse[] = [];
    for (const [, tc] of toolCalls) {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(tc.args);
      } catch { /* empty */ }

      const toolUse: ToolUse = { id: tc.id, name: tc.name, input: parsedInput };
      toolUses.push(toolUse);
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: parsedInput });
      options.onToolUse?.(toolUse);
    }

    const stopReason = toolUses.length > 0 ? 'tool_use' : 'end_turn';

    return {
      content,
      stopReason,
      usage: { inputTokens: 0, outputTokens: 0 },
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
