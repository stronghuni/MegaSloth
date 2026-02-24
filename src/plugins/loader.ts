import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type PluginManifest, type Plugin, type LoadedPlugin, type PluginContext } from './types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('plugin-loader');

export class PluginLoader {
  private pluginDirs: string[];
  private loaded: Map<string, LoadedPlugin> = new Map();

  constructor(pluginDirs: string[] = []) {
    this.pluginDirs = [
      join(process.cwd(), '.megasloth', 'plugins'),
      join(process.cwd(), 'plugins'),
      ...pluginDirs,
    ];
  }

  async loadAll(): Promise<LoadedPlugin[]> {
    const plugins: LoadedPlugin[] = [];

    for (const dir of this.pluginDirs) {
      if (!existsSync(dir)) continue;

      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const plugin = await this.loadPlugin(join(dir, entry.name));
          if (plugin) {
            plugins.push(plugin);
            this.loaded.set(plugin.manifest.name, plugin);
          }
        } catch (error) {
          logger.error({ plugin: entry.name, error: error instanceof Error ? error.message : error }, 'Failed to load plugin');
        }
      }
    }

    logger.info({ count: plugins.length }, 'Plugins loaded');
    return plugins;
  }

  private async loadPlugin(pluginPath: string): Promise<LoadedPlugin | null> {
    const manifestPath = join(pluginPath, 'plugin.json');
    if (!existsSync(manifestPath)) {
      const packagePath = join(pluginPath, 'package.json');
      if (!existsSync(packagePath)) return null;

      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      if (!pkg.megasloth) return null;

      return this.loadFromPackage(pluginPath, pkg);
    }

    const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    return this.loadFromManifest(pluginPath, manifest);
  }

  private async loadFromManifest(pluginPath: string, manifest: PluginManifest): Promise<LoadedPlugin> {
    const mainPath = resolve(pluginPath, manifest.main);
    const moduleUrl = pathToFileURL(mainPath).href;
    const module = await import(moduleUrl);
    const instance: Plugin = module.default || module;

    logger.info({ name: manifest.name, type: manifest.type, version: manifest.version }, 'Plugin loaded');

    return { manifest, instance, path: pluginPath, enabled: true };
  }

  private async loadFromPackage(pluginPath: string, pkg: Record<string, unknown>): Promise<LoadedPlugin> {
    const megasloth = pkg.megasloth as PluginManifest;
    const manifest: PluginManifest = {
      ...megasloth,
      name: megasloth.name || (pkg.name as string) || 'unknown',
      version: megasloth.version || (pkg.version as string) || '0.0.0',
      description: megasloth.description || (pkg.description as string) || '',
      main: megasloth.main || (pkg.main as string) || 'index.js',
    };

    return this.loadFromManifest(pluginPath, manifest);
  }

  async initializeAll(config: Record<string, unknown>): Promise<void> {
    for (const [name, plugin] of this.loaded) {
      try {
        const ctx: PluginContext = {
          config: (config[name] as Record<string, unknown>) || {},
          logger: {
            info: (msg) => logger.info({ plugin: name }, msg),
            warn: (msg) => logger.warn({ plugin: name }, msg),
            error: (msg) => logger.error({ plugin: name }, msg),
            debug: (msg) => logger.debug({ plugin: name }, msg),
          },
        };
        await plugin.instance.initialize?.(ctx);
      } catch (error) {
        logger.error({ plugin: name, error: error instanceof Error ? error.message : error }, 'Plugin initialization failed');
        plugin.enabled = false;
      }
    }
  }

  async destroyAll(): Promise<void> {
    for (const [name, plugin] of this.loaded) {
      try {
        await plugin.instance.destroy?.();
      } catch (error) {
        logger.error({ plugin: name, error: error instanceof Error ? error.message : error }, 'Plugin destroy failed');
      }
    }
    this.loaded.clear();
  }

  getLoaded(): LoadedPlugin[] {
    return Array.from(this.loaded.values());
  }

  getByType(type: string): LoadedPlugin[] {
    return this.getLoaded().filter(p => p.manifest.type === type && p.enabled);
  }

  get(name: string): LoadedPlugin | undefined {
    return this.loaded.get(name);
  }
}
