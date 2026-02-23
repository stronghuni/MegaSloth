import { describe, it, expect } from 'vitest';
import { createDefaultToolRegistry } from '../tools/registry.js';

describe('Tool Registry', () => {
  it('should create a default registry with tools', () => {
    const registry = createDefaultToolRegistry();
    expect(registry).toBeDefined();
  });

  it('should have getTools method', () => {
    const registry = createDefaultToolRegistry();
    const tools = registry.getTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  it('should have tools in each category', () => {
    const registry = createDefaultToolRegistry();
    const tools = registry.getTools();
    const categories = new Set(tools.map(t => t.category));

    expect(categories.has('git')).toBe(true);
    expect(categories.has('pr')).toBe(true);
    expect(categories.has('ci')).toBe(true);
    expect(categories.has('code')).toBe(true);
    expect(categories.has('issue')).toBe(true);
    expect(categories.has('env')).toBe(true);
    expect(categories.has('deploy')).toBe(true);
  });

  it('should have 30+ tools registered', () => {
    const registry = createDefaultToolRegistry();
    const tools = registry.getTools();
    expect(tools.length).toBeGreaterThanOrEqual(30);
  });

  it('should have unique tool names', () => {
    const registry = createDefaultToolRegistry();
    const tools = registry.getTools();
    const names = tools.map(t => t.definition.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('should have tool definitions with required fields', () => {
    const registry = createDefaultToolRegistry();
    const tools = registry.getTools();

    for (const tool of tools) {
      expect(tool.definition.name).toBeDefined();
      expect(tool.definition.description).toBeDefined();
      expect(tool.definition.input_schema).toBeDefined();
      expect(tool.definition.input_schema.type).toBe('object');
      expect(typeof tool.handler).toBe('function');
    }
  });

  it('should include new CI/CD tools', () => {
    const registry = createDefaultToolRegistry();
    const tools = registry.getTools();
    const toolNames = tools.map(t => t.definition.name);

    expect(toolNames).toContain('list_workflows');
    expect(toolNames).toContain('trigger_workflow');
    expect(toolNames).toContain('create_file');
    expect(toolNames).toContain('create_branch');
    expect(toolNames).toContain('create_pull_request');
    expect(toolNames).toContain('list_environments');
    expect(toolNames).toContain('set_env_variable');
    expect(toolNames).toContain('create_deployment');
  });
});
