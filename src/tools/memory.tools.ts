import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type ToolRegistry } from './registry.js';

interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  tags: string[];
  category: string;
  createdAt: string;
  updatedAt: string;
}

interface MemoryStore {
  entries: MemoryEntry[];
}

let memoryData: MemoryStore | null = null;
const memoryPath = () => join(process.env.MEGASLOTH_DATA_DIR || '.megasloth/data', 'memory.json');

function loadMemory(): MemoryStore {
  if (memoryData) return memoryData;
  const p = memoryPath();
  if (existsSync(p)) {
    try { memoryData = JSON.parse(readFileSync(p, 'utf-8')); } catch { memoryData = { entries: [] }; }
  } else {
    memoryData = { entries: [] };
  }
  return memoryData!;
}

function saveMemory(): void {
  mkdirSync(join(process.env.MEGASLOTH_DATA_DIR || '.megasloth/data'), { recursive: true });
  writeFileSync(memoryPath(), JSON.stringify(memoryData, null, 2));
}

export function registerMemoryTools(registry: ToolRegistry): void {
  registry.register({
    category: 'memory',
    definition: {
      name: 'memory_store',
      description: 'Store a key-value pair in persistent memory. Survives across sessions.',
      input_schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Unique key for this memory' },
          value: { type: 'string', description: 'Value to store' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
          category: { type: 'string', description: 'Category (e.g. project, preference, fact)' },
        },
        required: ['key', 'value'],
      },
    },
    handler: async (input) => {
      const store = loadMemory();
      const now = new Date().toISOString();
      const existing = store.entries.findIndex(e => e.key === input.key);

      const entry: MemoryEntry = {
        id: existing >= 0 ? store.entries[existing]!.id : `mem_${Date.now()}`,
        key: input.key as string,
        value: input.value as string,
        tags: (input.tags as string[]) || [],
        category: (input.category as string) || 'general',
        createdAt: existing >= 0 ? store.entries[existing]!.createdAt : now,
        updatedAt: now,
      };

      if (existing >= 0) store.entries[existing] = entry;
      else store.entries.push(entry);

      saveMemory();
      return `Memory stored: ${input.key}`;
    },
  });

  registry.register({
    category: 'memory',
    definition: {
      name: 'memory_search',
      description: 'Search persistent memory by keyword, tag, or category.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (matches key, value, tags)' },
          category: { type: 'string', description: 'Filter by category' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
      },
    },
    handler: async (input) => {
      const store = loadMemory();
      let results = store.entries;

      if (input.category) {
        results = results.filter(e => e.category === input.category);
      }

      if (input.query) {
        const q = (input.query as string).toLowerCase();
        results = results.filter(e =>
          e.key.toLowerCase().includes(q) ||
          e.value.toLowerCase().includes(q) ||
          e.tags.some(t => t.toLowerCase().includes(q)),
        );
      }

      const limit = Math.min((input.limit as number) || 20, 100);
      const sliced = results.slice(0, limit);

      if (sliced.length === 0) return 'No memories found';
      return JSON.stringify(sliced, null, 2);
    },
  });

  registry.register({
    category: 'memory',
    definition: {
      name: 'memory_list',
      description: 'List all stored memories with their keys and categories.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async () => {
      const store = loadMemory();
      if (store.entries.length === 0) return 'No memories stored';
      return store.entries
        .map(e => `[${e.category}] ${e.key}: ${e.value.substring(0, 100)}${e.value.length > 100 ? '...' : ''} (tags: ${e.tags.join(', ') || 'none'})`)
        .join('\n');
    },
  });

  registry.register({
    category: 'memory',
    definition: {
      name: 'memory_delete',
      description: 'Delete a memory entry by key.',
      input_schema: {
        type: 'object',
        properties: { key: { type: 'string', description: 'Memory key to delete' } },
        required: ['key'],
      },
    },
    handler: async (input) => {
      const store = loadMemory();
      const before = store.entries.length;
      store.entries = store.entries.filter(e => e.key !== input.key);
      if (store.entries.length < before) {
        saveMemory();
        return `Deleted: ${input.key}`;
      }
      return 'Memory not found';
    },
  });
}
