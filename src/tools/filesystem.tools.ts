import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, unlinkSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, dirname, extname } from 'node:path';
import { type ToolRegistry } from './registry.js';

const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.avi', '.mov', '.zip', '.tar', '.gz',
  '.pdf', '.exe', '.dll', '.so', '.dylib', '.class', '.pyc', '.o', '.a', '.wasm']);

function isBinary(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(extname(filePath).toLowerCase());
}

interface SearchMatch { file: string; line: number; text: string }

function nativeSearch(
  dir: string,
  pattern: RegExp,
  fileExt?: string,
  maxResults = 50,
): SearchMatch[] {
  const results: SearchMatch[] = [];
  const seen = new Set<string>();

  function walk(current: string, depth: number) {
    if (depth > 10 || results.length >= maxResults) return;
    try {
      const entries = readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) return;
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;

        const full = join(current, entry.name);
        if (seen.has(full)) continue;
        seen.add(full);

        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (!isBinary(full)) {
          if (fileExt && !entry.name.endsWith(`.${fileExt}`)) continue;
          try {
            const content = readFileSync(full, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length && results.length < maxResults; i++) {
              if (pattern.test(lines[i]!)) {
                results.push({ file: relative(dir, full), line: i + 1, text: lines[i]! });
              }
            }
          } catch { /* unreadable file */ }
        }
      }
    } catch { /* permission denied */ }
  }

  walk(dir, 0);
  return results;
}

export function registerFilesystemTools(registry: ToolRegistry): void {
  registry.register({
    category: 'filesystem',
    definition: {
      name: 'fs_read',
      description: 'Read a local file. Supports offset/limit for large files.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path (absolute or relative to workspace)' },
          offset: { type: 'number', description: 'Start line (1-indexed)' },
          limit: { type: 'number', description: 'Number of lines to read' },
        },
        required: ['path'],
      },
    },
    handler: async (input) => {
      const filePath = resolve(input.path as string);
      if (!existsSync(filePath)) return `File not found: ${filePath}`;
      if (isBinary(filePath)) return `Binary file (${extname(filePath)}): ${filePath} — ${statSync(filePath).size} bytes`;

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const offset = Math.max(0, ((input.offset as number) || 1) - 1);
      const limit = (input.limit as number) || lines.length;
      const slice = lines.slice(offset, offset + limit);

      return slice.map((line, i) => `${String(offset + i + 1).padStart(6)}|${line}`).join('\n');
    },
  });

  registry.register({
    category: 'filesystem',
    definition: {
      name: 'fs_write',
      description: 'Create or overwrite a file with given content.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'File content' },
        },
        required: ['path', 'content'],
      },
    },
    handler: async (input) => {
      const filePath = resolve(input.path as string);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, input.content as string, 'utf-8');
      return `Written: ${filePath} (${(input.content as string).length} chars)`;
    },
  });

  registry.register({
    category: 'filesystem',
    definition: {
      name: 'fs_edit',
      description: 'Replace a unique string in a file. old_string must match exactly one location.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old_string: { type: 'string', description: 'Exact text to find (must be unique)' },
          new_string: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
    handler: async (input) => {
      const filePath = resolve(input.path as string);
      if (!existsSync(filePath)) return `File not found: ${filePath}`;

      const content = readFileSync(filePath, 'utf-8');
      const oldStr = input.old_string as string;
      const occurrences = content.split(oldStr).length - 1;

      if (occurrences === 0) return `old_string not found in ${filePath}`;
      if (occurrences > 1) return `old_string found ${occurrences} times — must be unique. Add more context.`;

      writeFileSync(filePath, content.replace(oldStr, input.new_string as string), 'utf-8');
      return `Edited: ${filePath}`;
    },
  });

  registry.register({
    category: 'filesystem',
    definition: {
      name: 'fs_list',
      description: 'List files in a directory. Supports recursive listing and glob patterns.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (default: workspace root)' },
          recursive: { type: 'boolean', description: 'List recursively (default: false)' },
          pattern: { type: 'string', description: 'Filter by extension (e.g. ".ts")' },
        },
      },
    },
    handler: async (input) => {
      const dirPath = resolve((input.path as string) || '.');
      if (!existsSync(dirPath)) return `Directory not found: ${dirPath}`;

      const results: string[] = [];
      const pattern = input.pattern as string | undefined;

      function walk(dir: string, depth: number) {
        if (depth > 10 || results.length > 500) return;
        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const fullPath = join(dir, entry.name);
            const rel = relative(dirPath, fullPath);
            if (entry.isDirectory()) {
              results.push(`${rel}/`);
              if (input.recursive) walk(fullPath, depth + 1);
            } else {
              if (!pattern || entry.name.endsWith(pattern)) {
                const stat = statSync(fullPath);
                results.push(`${rel} (${stat.size} bytes)`);
              }
            }
          }
        } catch { /* permission denied */ }
      }

      walk(dirPath, 0);
      return results.length > 0 ? results.join('\n') : 'Empty directory';
    },
  });

  registry.register({
    category: 'filesystem',
    definition: {
      name: 'fs_delete',
      description: 'Delete a file or directory.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path to delete' } },
        required: ['path'],
      },
    },
    handler: async (input) => {
      const filePath = resolve(input.path as string);
      if (!existsSync(filePath)) return `Not found: ${filePath}`;
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        rmSync(filePath, { recursive: true });
      } else {
        unlinkSync(filePath);
      }
      return `Deleted: ${filePath}`;
    },
  });

  registry.register({
    category: 'filesystem',
    definition: {
      name: 'fs_search',
      description: 'Search for text patterns in files using recursive file scanning.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search pattern (regex supported)' },
          path: { type: 'string', description: 'Directory to search (default: workspace root)' },
          file_type: { type: 'string', description: 'File extension filter (e.g. "ts", "py")' },
        },
        required: ['pattern'],
      },
    },
    handler: async (input) => {
      const searchPath = resolve((input.path as string) || '.');
      if (!existsSync(searchPath)) return `Directory not found: ${searchPath}`;

      let regex: RegExp;
      try {
        regex = new RegExp(input.pattern as string, 'i');
      } catch {
        regex = new RegExp((input.pattern as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }

      const matches = nativeSearch(searchPath, regex, input.file_type as string | undefined);
      if (matches.length === 0) return 'No matches found';

      return matches.map(m => `${m.file}:${m.line}:${m.text}`).join('\n');
    },
  });

  registry.register({
    category: 'filesystem',
    definition: {
      name: 'fs_info',
      description: 'Get file metadata: size, modification date, permissions, type.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File or directory path' } },
        required: ['path'],
      },
    },
    handler: async (input) => {
      const filePath = resolve(input.path as string);
      if (!existsSync(filePath)) return `Not found: ${filePath}`;
      const stat = statSync(filePath);
      return JSON.stringify({
        path: filePath,
        type: stat.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modified: stat.mtime.toISOString(),
        created: stat.birthtime.toISOString(),
        permissions: `0${(stat.mode & 0o777).toString(8)}`,
      });
    },
  });
}
