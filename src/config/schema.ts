import { z } from 'zod';

export const serverConfigSchema = z.object({
  httpPort: z.number().default(3000),
  webhookPort: z.number().default(3001),
  websocketPort: z.number().default(18789),
  host: z.string().default('0.0.0.0'),
});

export const databaseConfigSchema = z.object({
  url: z.string().default('.megasloth/data/megasloth.db'),
});

export const redisConfigSchema = z.object({
  url: z.string().default('redis://localhost:6379'),
  maxRetriesPerRequest: z.number().default(3),
});

export const anthropicConfigSchema = z.object({
  apiKey: z.string(),
  model: z.string().default('claude-sonnet-4-6'),
  maxTokens: z.number().default(8192),
});

export const llmConfigSchema = z.object({
  provider: z.enum(['claude', 'openai', 'gemini']).default('claude'),
  apiKey: z.string(),
  model: z.string().optional(),
  maxTokens: z.number().default(8192),
});

export const githubConfigSchema = z.object({
  token: z.string().optional(),
  webhookSecret: z.string().optional(),
  apiUrl: z.string().default('https://api.github.com'),
});

export const gitlabConfigSchema = z.object({
  token: z.string().optional(),
  webhookSecret: z.string().optional(),
  url: z.string().default('https://gitlab.com'),
});

export const bitbucketConfigSchema = z.object({
  username: z.string().optional(),
  appPassword: z.string().optional(),
  webhookSecret: z.string().optional(),
});

export const slackConfigSchema = z.object({
  botToken: z.string().optional(),
  signingSecret: z.string().optional(),
  defaultChannel: z.string().default('general'),
});

export const discordConfigSchema = z.object({
  webhookUrl: z.string().optional(),
  botToken: z.string().optional(),
  defaultChannelId: z.string().optional(),
});

export const teamsConfigSchema = z.object({
  webhookUrl: z.string().optional(),
});

export const loggingConfigSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  pretty: z.boolean().default(true),
});

export const configSchema = z.object({
  server: serverConfigSchema.default({}),
  database: databaseConfigSchema.default({}),
  redis: redisConfigSchema.default({}),
  anthropic: anthropicConfigSchema.optional(),
  llm: llmConfigSchema.optional(),
  github: githubConfigSchema.default({}),
  gitlab: gitlabConfigSchema.default({}),
  bitbucket: bitbucketConfigSchema.default({}),
  slack: slackConfigSchema.default({}),
  discord: discordConfigSchema.default({}),
  teams: teamsConfigSchema.default({}),
  logging: loggingConfigSchema.default({}),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type RedisConfig = z.infer<typeof redisConfigSchema>;
export type AnthropicConfig = z.infer<typeof anthropicConfigSchema>;
export type GitHubConfig = z.infer<typeof githubConfigSchema>;
export type GitLabConfig = z.infer<typeof gitlabConfigSchema>;
export type BitbucketConfig = z.infer<typeof bitbucketConfigSchema>;
export type SlackConfig = z.infer<typeof slackConfigSchema>;
export type LoggingConfig = z.infer<typeof loggingConfigSchema>;
export type DiscordConfig = z.infer<typeof discordConfigSchema>;
export type TeamsConfig = z.infer<typeof teamsConfigSchema>;
export type LLMConfig = z.infer<typeof llmConfigSchema>;
export type Config = z.infer<typeof configSchema>;
