import { spawn, type ChildProcess } from 'node:child_process';
import { platform } from 'node:os';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('process-manager');
const isWin = platform() === 'win32';

function shellArgs(command: string): { cmd: string; args: string[] } {
  return isWin
    ? { cmd: 'cmd.exe', args: ['/c', command] }
    : { cmd: 'sh', args: ['-c', command] };
}

export interface ProcessSession {
  id: string;
  pid: number;
  command: string;
  cwd: string;
  startedAt: Date;
  status: 'running' | 'exited';
  exitCode?: number;
  output: string[];
  maxOutputLines: number;
}

const sessions = new Map<string, { session: ProcessSession; process: ChildProcess }>();
let sessionCounter = 0;

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/(?!\w)/,
  /mkfs/,
  /dd\s+if=.*of=\/dev/,
  /:\(\)\{\s*:\|:&\s*\};:/,
  /chmod\s+-R\s+777\s+\//,
  />(\/dev\/sd|\/dev\/nvme)/,
];

function isSafe(command: string): boolean {
  return !BLOCKED_PATTERNS.some(p => p.test(command));
}

export function shellExec(
  command: string,
  options: { cwd?: string; timeout?: number; env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (!isSafe(command)) {
    return Promise.resolve({ stdout: '', stderr: 'Blocked: dangerous command pattern detected', exitCode: 1 });
  }

  const cwd = options.cwd || process.cwd();
  const timeout = (options.timeout ?? 300) * 1000;

  return new Promise((resolve) => {
    const { cmd, args } = shellArgs(command);
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout?.on('data', (d: Buffer) => stdout.push(d));
    child.stderr?.on('data', (d: Buffer) => stderr.push(d));

    child.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: 1 });
    });

    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(stdout).toString('utf-8').slice(0, 100_000),
        stderr: Buffer.concat(stderr).toString('utf-8').slice(0, 50_000),
        exitCode: code ?? 1,
      });
    });
  });
}

export function shellBackground(
  command: string,
  options: { cwd?: string; env?: Record<string, string> } = {},
): { sessionId: string; pid: number } {
  if (!isSafe(command)) {
    throw new Error('Blocked: dangerous command pattern detected');
  }

  const id = `proc_${++sessionCounter}_${Date.now()}`;
  const cwd = options.cwd || process.cwd();

  const { cmd, args } = shellArgs(command);
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...options.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const session: ProcessSession = {
    id,
    pid: child.pid!,
    command,
    cwd,
    startedAt: new Date(),
    status: 'running',
    output: [],
    maxOutputLines: 1000,
  };

  const pushLine = (line: string) => {
    session.output.push(line);
    if (session.output.length > session.maxOutputLines) {
      session.output.splice(0, session.output.length - session.maxOutputLines);
    }
  };

  child.stdout?.on('data', (d: Buffer) => d.toString().split('\n').forEach(pushLine));
  child.stderr?.on('data', (d: Buffer) => d.toString().split('\n').forEach(l => pushLine(`[stderr] ${l}`)));

  child.on('close', (code) => {
    session.status = 'exited';
    session.exitCode = code ?? 1;
    logger.info({ sessionId: id, exitCode: code }, 'Background process exited');
  });

  sessions.set(id, { session, process: child });
  logger.info({ sessionId: id, pid: child.pid, command }, 'Background process started');

  return { sessionId: id, pid: child.pid! };
}

export function processList(): ProcessSession[] {
  return Array.from(sessions.values()).map(s => s.session);
}

export function processPoll(sessionId: string, lastN = 50): { status: string; exitCode?: number; output: string[] } | null {
  const entry = sessions.get(sessionId);
  if (!entry) return null;
  const { session } = entry;
  return {
    status: session.status,
    exitCode: session.exitCode,
    output: session.output.slice(-lastN),
  };
}

export function processKill(sessionId: string): boolean {
  const entry = sessions.get(sessionId);
  if (!entry) return false;
  try {
    entry.process.kill('SIGTERM');
    setTimeout(() => {
      try { entry.process.kill('SIGKILL'); } catch { /* already dead */ }
    }, 5000);
    return true;
  } catch {
    return false;
  }
}

export function processWrite(sessionId: string, input: string): boolean {
  const entry = sessions.get(sessionId);
  if (!entry || entry.session.status !== 'running') return false;
  try {
    entry.process.stdin?.write(input);
    return true;
  } catch {
    return false;
  }
}
