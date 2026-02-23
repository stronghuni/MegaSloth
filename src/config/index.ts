import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { config as loadDotenv } from 'dotenv';
import { configSchema, type Config } from './schema.js';

loadDotenv();

const CONFIG_PATHS = [
  '.megasloth/config.yaml',
  '.megasloth/config.yml',
  'megasloth.yaml',
  'megasloth.yml',
];

function findConfigFile(): string | null {
  for (const configPath of CONFIG_PATHS) {
    if (existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

function loadYamlConfig(): Record<string, unknown> {
  const configFile = findConfigFile();
  if (!configFile) {
    return {};
  }

  try {
    const content = readFileSync(configFile, 'utf-8');
    return parseYaml(content) || {};
  } catch (error) {
    console.warn(`Failed to load config file ${configFile}:`, error);
    return {};
  }
}

function loadEnvConfig(): Record<string, unknown> {
  return {
    server: {
      httpPort: process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : undefined,
      webhookPort: process.env.WEBHOOK_PORT ? parseInt(process.env.WEBHOOK_PORT, 10) : undefined,
      websocketPort: process.env.WEBSOCKET_PORT ? parseInt(process.env.WEBSOCKET_PORT, 10) : undefined,
      host: process.env.HOST,
    },
    database: {
      url: process.env.DATABASE_URL,
    },
    redis: {
      url: process.env.REDIS_URL,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL,
      maxTokens: process.env.ANTHROPIC_MAX_TOKENS ? parseInt(process.env.ANTHROPIC_MAX_TOKENS, 10) : undefined,
    },
    llm: {
      provider: process.env.LLM_PROVIDER as 'claude' | 'openai' | 'gemini' | undefined,
      apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY,
      model: process.env.LLM_MODEL,
      maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS, 10) : undefined,
    },
    github: {
      token: process.env.GITHUB_TOKEN,
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
      apiUrl: process.env.GITHUB_API_URL,
    },
    gitlab: {
      token: process.env.GITLAB_TOKEN,
      webhookSecret: process.env.GITLAB_WEBHOOK_SECRET,
      url: process.env.GITLAB_URL,
    },
    bitbucket: {
      username: process.env.BITBUCKET_USERNAME,
      appPassword: process.env.BITBUCKET_APP_PASSWORD,
      webhookSecret: process.env.BITBUCKET_WEBHOOK_SECRET,
    },
    slack: {
      botToken: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      defaultChannel: process.env.SLACK_DEFAULT_CHANNEL,
    },
    logging: {
      level: process.env.LOG_LEVEL as 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | undefined,
      pretty: process.env.LOG_PRETTY ? process.env.LOG_PRETTY === 'true' : undefined,
    },
  };
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (sourceValue === undefined || sourceValue === null) {
      continue;
    }

    if (typeof sourceValue === 'object' && !Array.isArray(sourceValue) && sourceValue !== null) {
      if (typeof targetValue === 'object' && !Array.isArray(targetValue) && targetValue !== null) {
        result[key] = deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
      } else {
        result[key] = sourceValue;
      }
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}

function cleanUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const cleaned = cleanUndefined(value as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) {
        result[key] = cleaned;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

export function loadConfig(): Config {
  const yamlConfig = loadYamlConfig();
  const envConfig = cleanUndefined(loadEnvConfig());

  const mergedConfig = deepMerge(yamlConfig, envConfig);

  const parsed = configSchema.safeParse(mergedConfig);

  if (!parsed.success) {
    const errors = parsed.error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  // Ensure data directory exists
  const dbPath = parsed.data.database.url;
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  return parsed.data;
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function reloadConfig(): Config {
  cachedConfig = loadConfig();
  return cachedConfig;
}

export * from './schema.js';
