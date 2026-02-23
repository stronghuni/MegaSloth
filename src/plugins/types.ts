import { type ToolDefinition } from '../providers/types.js';

export type PluginType = 'tool' | 'skill' | 'provider' | 'notification' | 'adapter';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  type: PluginType;
  main: string;
  dependencies?: Record<string, string>;
  config?: Record<string, {
    type: 'string' | 'number' | 'boolean';
    description: string;
    required?: boolean;
    default?: unknown;
  }>;
}

export interface PluginContext {
  config: Record<string, unknown>;
  logger: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
    debug(msg: string): void;
  };
}

export interface ToolPlugin {
  type: 'tool';
  tools: Array<{
    definition: ToolDefinition;
    handler: (input: Record<string, unknown>, ctx: PluginContext) => Promise<string>;
  }>;
  initialize?(ctx: PluginContext): Promise<void>;
  destroy?(): Promise<void>;
}

export interface SkillPlugin {
  type: 'skill';
  skills: Array<{
    name: string;
    description: string;
    triggers: Array<{ type: 'webhook' | 'cron'; events?: string[]; schedule?: string }>;
    prompt: string;
    tools: string[];
  }>;
  initialize?(ctx: PluginContext): Promise<void>;
  destroy?(): Promise<void>;
}

export interface ProviderPlugin {
  type: 'provider';
  providerName: string;
  createProvider(config: Record<string, unknown>): unknown;
  initialize?(ctx: PluginContext): Promise<void>;
  destroy?(): Promise<void>;
}

export interface NotificationPlugin {
  type: 'notification';
  channelName: string;
  sendMessage(message: { text: string; metadata?: Record<string, unknown> }): Promise<boolean>;
  initialize?(ctx: PluginContext): Promise<void>;
  destroy?(): Promise<void>;
}

export interface AdapterPlugin {
  type: 'adapter';
  platformName: string;
  createAdapter(config: Record<string, unknown>): unknown;
  initialize?(ctx: PluginContext): Promise<void>;
  destroy?(): Promise<void>;
}

export type Plugin = ToolPlugin | SkillPlugin | ProviderPlugin | NotificationPlugin | AdapterPlugin;

export interface LoadedPlugin {
  manifest: PluginManifest;
  instance: Plugin;
  path: string;
  enabled: boolean;
}
