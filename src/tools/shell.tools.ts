import { type ToolRegistry } from './registry.js';
import {
  shellExec,
  shellBackground,
  processList,
  processPoll,
  processKill,
  processWrite,
} from './shell/process-manager.js';

export function registerShellTools(registry: ToolRegistry): void {
  registry.register({
    category: 'shell',
    definition: {
      name: 'shell_exec',
      description: 'Execute a shell command and return stdout/stderr. Use for builds, tests, git operations, package management, and any CLI task.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          cwd: { type: 'string', description: 'Working directory (default: workspace root)' },
          timeout: { type: 'number', description: 'Timeout in seconds (default: 300)' },
        },
        required: ['command'],
      },
    },
    handler: async (input) => {
      const result = await shellExec(input.command as string, {
        cwd: input.cwd as string | undefined,
        timeout: input.timeout as number | undefined,
      });
      return JSON.stringify({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
    },
  });

  registry.register({
    category: 'shell',
    definition: {
      name: 'shell_background',
      description: 'Start a long-running background process (dev servers, watchers, builds). Returns a sessionId for monitoring.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run in background' },
          cwd: { type: 'string', description: 'Working directory' },
        },
        required: ['command'],
      },
    },
    handler: async (input) => {
      const result = shellBackground(input.command as string, { cwd: input.cwd as string | undefined });
      return JSON.stringify(result);
    },
  });

  registry.register({
    category: 'shell',
    definition: {
      name: 'process_list',
      description: 'List all background process sessions with their status.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async () => {
      const list = processList();
      return JSON.stringify(list.map(s => ({
        sessionId: s.id, pid: s.pid, command: s.command, status: s.status,
        exitCode: s.exitCode, startedAt: s.startedAt,
      })));
    },
  });

  registry.register({
    category: 'shell',
    definition: {
      name: 'process_poll',
      description: 'Get recent output and status of a background process session.',
      input_schema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session ID from shell_background' },
          last_n: { type: 'number', description: 'Number of recent output lines (default: 50)' },
        },
        required: ['session_id'],
      },
    },
    handler: async (input) => {
      const result = processPoll(input.session_id as string, input.last_n as number | undefined);
      if (!result) return 'Session not found';
      return JSON.stringify(result);
    },
  });

  registry.register({
    category: 'shell',
    definition: {
      name: 'process_kill',
      description: 'Kill a running background process.',
      input_schema: {
        type: 'object',
        properties: { session_id: { type: 'string', description: 'Session ID to kill' } },
        required: ['session_id'],
      },
    },
    handler: async (input) => {
      return processKill(input.session_id as string) ? 'Process killed' : 'Session not found or already exited';
    },
  });

  registry.register({
    category: 'shell',
    definition: {
      name: 'process_write',
      description: 'Write stdin input to a running background process (for interactive CLIs).',
      input_schema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session ID' },
          input: { type: 'string', description: 'Text to write to stdin' },
        },
        required: ['session_id', 'input'],
      },
    },
    handler: async (input) => {
      return processWrite(input.session_id as string, input.input as string) ? 'Input sent' : 'Failed to write';
    },
  });
}
