import { type LLMProvider, type LLMProviderConfig } from './types.js';
import { ClaudeProvider } from './claude.provider.js';
import { OpenAIProvider } from './openai.provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('llm-factory');

export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  logger.info({ provider: config.provider, model: config.model }, 'Creating LLM provider');

  switch (config.provider) {
    case 'claude':
      return new ClaudeProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
