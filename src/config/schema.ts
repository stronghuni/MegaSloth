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
  model: z.string().default('claude-sonnet-4-20250514'),
  maxTokens: z.number().default(4096),
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

export const loggingConfigSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  pretty: z.boolean().default(true),
});

export const configSchema = z.object({
  server: serverConfigSchema.default({}),
  database: databaseConfigSchema.default({}),
  redis: redisConfigSchema.default({}),
  anthropic: anthropicConfigSchema,
  github: githubConfigSchema.default({}),
  gitlab: gitlabConfigSchema.default({}),
  bitbucket: bitbucketConfigSchema.default({}),
  slack: slackConfigSchema.default({}),
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
export type Config = z.infer<typeof configSchema>;
