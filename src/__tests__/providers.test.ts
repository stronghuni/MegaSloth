import { describe, it, expect } from 'vitest';
import { DEFAULT_MODELS } from '../providers/types.js';
import { createLLMProvider } from '../providers/factory.js';

describe('LLM Provider System', () => {
  describe('DEFAULT_MODELS', () => {
    it('should define default models for all providers', () => {
      expect(DEFAULT_MODELS.claude).toBeDefined();
      expect(DEFAULT_MODELS.openai).toBeDefined();
      expect(DEFAULT_MODELS.gemini).toBeDefined();
    });

    it('should have valid model names', () => {
      expect(DEFAULT_MODELS.claude).toContain('claude');
      expect(DEFAULT_MODELS.openai).toContain('gpt');
      expect(DEFAULT_MODELS.gemini).toContain('gemini');
    });
  });

  describe('createLLMProvider', () => {
    it('should create a Claude provider', () => {
      const provider = createLLMProvider({ provider: 'claude', apiKey: 'test-key' });
      expect(provider.name).toBe('claude');
      expect(provider.model).toBe(DEFAULT_MODELS.claude);
    });

    it('should create an OpenAI provider', () => {
      const provider = createLLMProvider({ provider: 'openai', apiKey: 'test-key' });
      expect(provider.name).toBe('openai');
      expect(provider.model).toBe(DEFAULT_MODELS.openai);
    });

    it('should create a Gemini provider', () => {
      const provider = createLLMProvider({ provider: 'gemini', apiKey: 'test-key' });
      expect(provider.name).toBe('gemini');
      expect(provider.model).toBe(DEFAULT_MODELS.gemini);
    });

    it('should use custom model when provided', () => {
      const provider = createLLMProvider({ provider: 'claude', apiKey: 'test-key', model: 'custom-model' });
      expect(provider.model).toBe('custom-model');
    });

    it('should throw for unsupported provider', () => {
      expect(() => createLLMProvider({ provider: 'invalid' as 'claude', apiKey: 'key' })).toThrow('Unsupported LLM provider');
    });

    it('should implement LLMProvider interface', () => {
      const provider = createLLMProvider({ provider: 'claude', apiKey: 'test-key' });
      expect(typeof provider.chat).toBe('function');
      expect(typeof provider.streamChat).toBe('function');
      expect(typeof provider.createToolResultMessage).toBe('function');
    });
  });
});
