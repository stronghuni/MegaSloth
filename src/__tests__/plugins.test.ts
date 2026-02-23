import { describe, it, expect } from 'vitest';
import { PluginLoader } from '../plugins/loader.js';
import { PluginRegistry } from '../plugins/registry.js';

describe('Plugin System', () => {
  describe('PluginLoader', () => {
    it('should initialize with default dirs', () => {
      const loader = new PluginLoader();
      expect(loader).toBeDefined();
    });

    it('should initialize with custom dirs', () => {
      const loader = new PluginLoader(['/tmp/test-plugins']);
      expect(loader).toBeDefined();
    });

    it('should return empty array when no plugins exist', async () => {
      const loader = new PluginLoader(['/tmp/nonexistent-dir']);
      const plugins = await loader.loadAll();
      expect(plugins).toEqual([]);
    });

    it('should provide getLoaded method', () => {
      const loader = new PluginLoader();
      expect(loader.getLoaded()).toEqual([]);
    });

    it('should filter by type', () => {
      const loader = new PluginLoader();
      expect(loader.getByType('tool')).toEqual([]);
      expect(loader.getByType('skill')).toEqual([]);
    });
  });

  describe('PluginRegistry', () => {
    it('should initialize', async () => {
      const registry = new PluginRegistry(['/tmp/nonexistent']);
      await registry.initialize();
      expect(registry.getAll()).toEqual([]);
    });

    it('should return empty arrays for all plugin types', async () => {
      const registry = new PluginRegistry(['/tmp/nonexistent']);
      await registry.initialize();
      expect(registry.getToolPlugins()).toEqual([]);
      expect(registry.getSkillPlugins()).toEqual([]);
      expect(registry.getProviderPlugins()).toEqual([]);
      expect(registry.getNotificationPlugins()).toEqual([]);
      expect(registry.getAdapterPlugins()).toEqual([]);
    });

    it('should collect tool definitions', async () => {
      const registry = new PluginRegistry(['/tmp/nonexistent']);
      await registry.initialize();
      expect(registry.getAllToolDefinitions()).toEqual([]);
    });

    it('should collect skill definitions', async () => {
      const registry = new PluginRegistry(['/tmp/nonexistent']);
      await registry.initialize();
      expect(registry.getAllSkillDefinitions()).toEqual([]);
    });

    it('should handle destroy', async () => {
      const registry = new PluginRegistry(['/tmp/nonexistent']);
      await registry.initialize();
      await registry.destroy();
      expect(registry.getAll()).toEqual([]);
    });

    it('should not re-initialize', async () => {
      const registry = new PluginRegistry(['/tmp/nonexistent']);
      await registry.initialize();
      await registry.initialize();
      expect(registry.getAll()).toEqual([]);
    });
  });
});
