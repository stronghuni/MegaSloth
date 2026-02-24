import { type ToolRegistry } from './registry.js';
import {
  shellBackground,
  processList,
  processPoll,
  processKill,
  processWrite,
} from './shell/process-manager.js';

interface AgentSession {
  id: string;
  name: string;
  processId: string;
  createdAt: string;
  description: string;
}

const agentSessions: Map<string, AgentSession> = new Map();

export function registerSessionTools(registry: ToolRegistry): void {
  registry.register({
    category: 'session',
    definition: {
      name: 'session_spawn',
      description: 'Spawn a new agent sub-session (a persistent background task that runs independently).',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Session name (e.g. "background-tests", "file-watcher")' },
          command: { type: 'string', description: 'Shell command to run in this session' },
          cwd: { type: 'string', description: 'Working directory' },
          description: { type: 'string', description: 'What this session does' },
        },
        required: ['name', 'command'],
      },
    },
    handler: async (input) => {
      const { sessionId, pid } = shellBackground(input.command as string, { cwd: input.cwd as string | undefined });

      const session: AgentSession = {
        id: sessionId,
        name: input.name as string,
        processId: sessionId,
        createdAt: new Date().toISOString(),
        description: (input.description as string) || input.command as string,
      };

      agentSessions.set(sessionId, session);
      return JSON.stringify({ sessionId, pid, name: session.name });
    },
  });

  registry.register({
    category: 'session',
    definition: {
      name: 'session_list',
      description: 'List all active agent sessions with their status.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async () => {
      const processes = processList();
      const sessions = Array.from(agentSessions.values()).map(s => {
        const proc = processes.find(p => p.id === s.processId);
        return {
          id: s.id,
          name: s.name,
          status: proc?.status || 'unknown',
          pid: proc?.pid,
          command: proc?.command,
          description: s.description,
          createdAt: s.createdAt,
        };
      });

      if (sessions.length === 0) return 'No active sessions';
      return JSON.stringify(sessions, null, 2);
    },
  });

  registry.register({
    category: 'session',
    definition: {
      name: 'session_send',
      description: 'Send stdin input to a running session (for interactive processes).',
      input_schema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session ID' },
          input: { type: 'string', description: 'Text to send to the session stdin' },
        },
        required: ['session_id', 'input'],
      },
    },
    handler: async (input) => {
      const sent = processWrite(input.session_id as string, input.input as string);
      return sent ? 'Input sent to session' : 'Failed: session not found or not running';
    },
  });
}
