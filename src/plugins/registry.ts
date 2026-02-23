import { PluginLoader } from './loader.js';
import { type LoadedPlugin, type ToolPlugin, type SkillPlugin, type NotificationPlugin } from './types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('plugin-registry');

export class PluginRegistry {
  private loader: PluginLoader;
  private initialized = false;

  constructor(pluginDirs?: string[]) {
    this.loader = new PluginLoader(pluginDirs);
  }

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    if (this.initialized) return;

    await this.loader.loadAll();
    await this.loader.initializeAll(config);
    this.initialized = true;

    const plugins = this.loader.getLoaded();
    logger.info({
      total: plugins.length,
      tools: this.getToolPlugins().length,
      skills: this.getSkillPlugins().length,
      notifications: this.getNotificationPlugins().length,
    }, 'Plugin registry initialized');
  }

  async destroy(): Promise<void> {
    await this.loader.destroyAll();
    this.initialized = false;
  }

  getToolPlugins(): LoadedPlugin[] {
    return this.loader.getByType('tool');
  }

  getSkillPlugins(): LoadedPlugin[] {
    return this.loader.getByType('skill');
  }

  getProviderPlugins(): LoadedPlugin[] {
    return this.loader.getByType('provider');
  }

  getNotificationPlugins(): LoadedPlugin[] {
    return this.loader.getByType('notification');
  }

  getAdapterPlugins(): LoadedPlugin[] {
    return this.loader.getByType('adapter');
  }

  getAllToolDefinitions() {
    const tools: Array<{ pluginName: string; definition: unknown; handler: unknown }> = [];
    for (const plugin of this.getToolPlugins()) {
      const toolPlugin = plugin.instance as ToolPlugin;
      for (const tool of toolPlugin.tools) {
        tools.push({ pluginName: plugin.manifest.name, definition: tool.definition, handler: tool.handler });
      }
    }
    return tools;
  }

  getAllSkillDefinitions() {
    const skills: Array<{ pluginName: string; skill: unknown }> = [];
    for (const plugin of this.getSkillPlugins()) {
      const skillPlugin = plugin.instance as SkillPlugin;
      for (const skill of skillPlugin.skills) {
        skills.push({ pluginName: plugin.manifest.name, skill });
      }
    }
    return skills;
  }

  async broadcastNotification(message: { text: string; metadata?: Record<string, unknown> }): Promise<void> {
    for (const plugin of this.getNotificationPlugins()) {
      try {
        const notifPlugin = plugin.instance as NotificationPlugin;
        await notifPlugin.sendMessage(message);
      } catch (error) {
        logger.error({ plugin: plugin.manifest.name, error }, 'Notification plugin failed');
      }
    }
  }

  getAll(): LoadedPlugin[] {
    return this.loader.getLoaded();
  }
}
