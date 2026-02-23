import { describe, it, expect } from 'vitest';
import { configSchema, llmConfigSchema, serverConfigSchema, discordConfigSchema, teamsConfigSchema } from '../config/schema.js';

describe('Configuration Schema', () => {
  describe('serverConfigSchema', () => {
    it('should have valid defaults', () => {
      const config = serverConfigSchema.parse({});
      expect(config.httpPort).toBe(3000);
      expect(config.webhookPort).toBe(3001);
      expect(config.websocketPort).toBe(18789);
      expect(config.host).toBe('0.0.0.0');
    });

    it('should accept custom values', () => {
      const config = serverConfigSchema.parse({ httpPort: 8080, webhookPort: 9090 });
      expect(config.httpPort).toBe(8080);
      expect(config.webhookPort).toBe(9090);
    });
  });

  describe('llmConfigSchema', () => {
    it('should require apiKey', () => {
      expect(() => llmConfigSchema.parse({})).toThrow();
    });

    it('should default provider to claude', () => {
      const config = llmConfigSchema.parse({ apiKey: 'test-key' });
      expect(config.provider).toBe('claude');
    });

    it('should accept all providers', () => {
      for (const provider of ['claude', 'openai', 'gemini']) {
        const config = llmConfigSchema.parse({ apiKey: 'key', provider });
        expect(config.provider).toBe(provider);
      }
    });

    it('should reject invalid provider', () => {
      expect(() => llmConfigSchema.parse({ apiKey: 'key', provider: 'invalid' })).toThrow();
    });
  });

  describe('discordConfigSchema', () => {
    it('should accept empty config', () => {
      const config = discordConfigSchema.parse({});
      expect(config.webhookUrl).toBeUndefined();
      expect(config.botToken).toBeUndefined();
    });

    it('should accept webhook URL', () => {
      const config = discordConfigSchema.parse({ webhookUrl: 'https://discord.com/api/webhooks/...' });
      expect(config.webhookUrl).toBeDefined();
    });
  });

  describe('teamsConfigSchema', () => {
    it('should accept empty config', () => {
      const config = teamsConfigSchema.parse({});
      expect(config.webhookUrl).toBeUndefined();
    });
  });

  describe('configSchema', () => {
    it('should parse minimal config', () => {
      const config = configSchema.parse({});
      expect(config.server).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.redis).toBeDefined();
      expect(config.logging).toBeDefined();
    });

    it('should include discord and teams sections', () => {
      const config = configSchema.parse({});
      expect(config.discord).toBeDefined();
      expect(config.teams).toBeDefined();
    });
  });
});
