import { GoogleGenAI, type Content, type FunctionDeclaration, type Tool as GeminiTool } from '@google/genai';
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

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  readonly model: string;
  private client: GoogleGenAI;
  private maxTokens: number;
  private logger = getLogger('gemini-provider');

  constructor(config: LLMProviderConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model || DEFAULT_MODELS.gemini;
    this.maxTokens = config.maxTokens || 4096;
  }

  private convertToolsToDeclarations(tools?: ToolDefinition[]): GeminiTool[] | undefined {
    if (!tools?.length) return undefined;

    const declarations: FunctionDeclaration[] = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema as FunctionDeclaration['parameters'],
    }));

    return [{ functionDeclarations: declarations }];
  }

  private convertMessages(messages: Message[], system?: string): { contents: Content[]; systemInstruction?: string } {
    const contents: Content[] = [];

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
        continue;
      }

      const parts: Content['parts'] = [];

      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          parts.push({ text: block.text });
        } else if (block.type === 'tool_use') {
          parts.push({
            functionCall: {
              name: block.name!,
              args: block.input || {},
            },
          });
        } else if (block.type === 'tool_result') {
          parts.push({
            functionResponse: {
              name: block.tool_use_id || 'unknown',
              response: { result: block.content || '' },
            },
          });
        }
      }

      if (parts.length > 0) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts,
        });
      }
    }

    return { contents, systemInstruction: system };
  }

  async chat(messages: Message[], options: ChatOptions = {}): Promise<LLMResponse> {
    const startTime = Date.now();

    this.logger.debug({
      messageCount: messages.length,
      hasTools: !!options.tools?.length,
    }, 'Sending request to Gemini');

    const { contents, systemInstruction } = this.convertMessages(messages, options.system);

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        maxOutputTokens: options.maxTokens || this.maxTokens,
        temperature: options.temperature,
        systemInstruction,
        tools: this.convertToolsToDeclarations(options.tools),
      },
    });

    const durationMs = Date.now() - startTime;
    const toolUses: ToolUse[] = [];
    const content: ContentBlock[] = [];
    let textContent = '';

    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.text) {
          textContent += part.text;
          content.push({ type: 'text', text: part.text });
        }
        if (part.functionCall) {
          const toolId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const toolUse: ToolUse = {
            id: toolId,
            name: part.functionCall.name!,
            input: (part.functionCall.args || {}) as Record<string, unknown>,
          };
          toolUses.push(toolUse);
          content.push({
            type: 'tool_use',
            id: toolId,
            name: part.functionCall.name!,
            input: toolUse.input,
          });
        }
      }
    }

    const stopReason = toolUses.length > 0 ? 'tool_use' : 'end_turn';

    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

    this.logger.debug({
      stopReason,
      inputTokens,
      outputTokens,
      toolUseCount: toolUses.length,
      durationMs,
    }, 'Gemini response received');

    return {
      content,
      stopReason,
      usage: { inputTokens, outputTokens },
      toolUses,
      textContent,
    };
  }

  async streamChat(messages: Message[], options: StreamChatOptions = {}): Promise<LLMResponse> {
    const { contents, systemInstruction } = this.convertMessages(messages, options.system);

    const response = await this.client.models.generateContentStream({
      model: this.model,
      contents,
      config: {
        maxOutputTokens: options.maxTokens || this.maxTokens,
        temperature: options.temperature,
        systemInstruction,
        tools: this.convertToolsToDeclarations(options.tools),
      },
    });

    const toolUses: ToolUse[] = [];
    const content: ContentBlock[] = [];
    let textContent = '';

    for await (const chunk of response) {
      const candidate = chunk.candidates?.[0];
      if (!candidate?.content?.parts) continue;

      for (const part of candidate.content.parts) {
        if (part.text) {
          textContent += part.text;
          options.onText?.(part.text);
        }
        if (part.functionCall) {
          const toolId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const toolUse: ToolUse = {
            id: toolId,
            name: part.functionCall.name!,
            input: (part.functionCall.args || {}) as Record<string, unknown>,
          };
          toolUses.push(toolUse);
          content.push({ type: 'tool_use', id: toolId, name: part.functionCall.name!, input: toolUse.input });
          options.onToolUse?.(toolUse);
        }
      }
    }

    if (textContent) {
      content.unshift({ type: 'text', text: textContent });
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
