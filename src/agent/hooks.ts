import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getLogger } from '../utils/logger.js';

const execAsync = promisify(exec);

export type HookEventType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreCompact';

export interface HookMatcher {
  tool?: string;
  command?: string;
}

export interface HookDefinition {
  matcher: HookMatcher;
  type: 'command' | 'deny';
  command?: string;
  message?: string;
}

export interface HookConfig {
  hooks: Partial<Record<HookEventType, HookDefinition[]>>;
}

export type HookDecision = 'allow' | 'deny';

export interface HookResult {
  decision: HookDecision;
  reason?: string;
  modified?: Record<string, unknown>;
}

const DEFAULT_BLOCKED_PATTERNS = [
  'rm\\s+-rf\\s+/',
  'rm\\s+-rf\\s+\\*',
  'DROP\\s+TABLE',
  'DROP\\s+DATABASE',
  'TRUNCATE\\s+TABLE',
  'git\\s+push\\s+--force\\s+origin\\s+(main|master)',
  'chmod\\s+777',
  'mkfs\\.',
  'dd\\s+if=',
  ':(){ :|:& };:',
  'curl.*\\|\\s*(bash|sh)',
  'wget.*\\|\\s*(bash|sh)',
];

export class HookEngine {
  private config: HookConfig;
  private logger = getLogger('hook-engine');
  private blockedPatterns: RegExp[];

  constructor(configPath?: string) {
    this.config = this.loadConfig(configPath);
    this.blockedPatterns = this.buildBlockedPatterns();
    this.logger.info(
      { hookCount: this.countHooks() },
      'Hook engine initialized'
    );
  }

  private loadConfig(configPath?: string): HookConfig {
    const paths = [
      configPath,
      join(process.cwd(), '.megasloth', 'hooks.json'),
      join(process.cwd(), '.megasloth', 'hooks.yaml'),
    ].filter(Boolean) as string[];

    for (const p of paths) {
      if (existsSync(p)) {
        try {
          const raw = readFileSync(p, 'utf-8');
          const parsed = JSON.parse(raw) as HookConfig;
          this.logger.info({ path: p }, 'Loaded hook config');
          return parsed;
        } catch {
          this.logger.warn({ path: p }, 'Failed to parse hook config');
        }
      }
    }

    return this.getDefaultConfig();
  }

  private getDefaultConfig(): HookConfig {
    return {
      hooks: {
        PreToolUse: DEFAULT_BLOCKED_PATTERNS.map(pattern => ({
          matcher: { tool: 'shell_exec', command: pattern },
          type: 'deny' as const,
          message: `Blocked: dangerous command pattern detected`,
        })),
      },
    };
  }

  private buildBlockedPatterns(): RegExp[] {
    const patterns: RegExp[] = [];

    const preToolHooks = this.config.hooks.PreToolUse || [];
    for (const hook of preToolHooks) {
      if (hook.type === 'deny' && hook.matcher.command) {
        try {
          patterns.push(new RegExp(hook.matcher.command, 'i'));
        } catch {
          this.logger.warn(
            { pattern: hook.matcher.command },
            'Invalid regex pattern in hook'
          );
        }
      }
    }

    if (patterns.length === 0) {
      for (const p of DEFAULT_BLOCKED_PATTERNS) {
        patterns.push(new RegExp(p, 'i'));
      }
    }

    return patterns;
  }

  private countHooks(): number {
    let count = 0;
    for (const hooks of Object.values(this.config.hooks)) {
      count += hooks?.length || 0;
    }
    return count;
  }

  async runPreToolUse(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<HookResult> {
    if (this.isCommandBlocked(toolName, input)) {
      const commandStr = this.extractCommand(toolName, input);
      this.logger.warn(
        { toolName, command: commandStr },
        'Tool blocked by hook'
      );
      return {
        decision: 'deny',
        reason: `Blocked: dangerous command pattern detected in "${commandStr}"`,
      };
    }

    const hooks = this.config.hooks.PreToolUse || [];
    for (const hook of hooks) {
      if (!this.matchesTool(hook.matcher, toolName, input)) continue;

      if (hook.type === 'deny') {
        return {
          decision: 'deny',
          reason: hook.message || `Blocked by PreToolUse hook`,
        };
      }

      if (hook.type === 'command' && hook.command) {
        try {
          const env = {
            ...process.env,
            TOOL_NAME: toolName,
            TOOL_INPUT: JSON.stringify(input),
          };
          const { exitCode } = await this.runCommand(hook.command, env);
          if (exitCode === 2) {
            return {
              decision: 'deny',
              reason: hook.message || `Blocked by PreToolUse hook command`,
            };
          }
        } catch (err) {
          this.logger.error({ err, hook }, 'PreToolUse hook command failed');
        }
      }
    }

    return { decision: 'allow' };
  }

  async runPostToolUse(
    toolName: string,
    input: Record<string, unknown>,
    result: { result: string; isError: boolean }
  ): Promise<void> {
    const hooks = this.config.hooks.PostToolUse || [];
    for (const hook of hooks) {
      if (!this.matchesTool(hook.matcher, toolName, input)) continue;

      if (hook.type === 'command' && hook.command) {
        try {
          const filePath = (input.path || input.file_path || '') as string;
          const cmd = hook.command.replace('$FILE_PATH', filePath);
          const env = {
            ...process.env,
            TOOL_NAME: toolName,
            TOOL_INPUT: JSON.stringify(input),
            TOOL_RESULT: result.result.substring(0, 10000),
            FILE_PATH: filePath,
          };
          await this.runCommand(cmd, env);
        } catch (err) {
          this.logger.warn({ err, hook }, 'PostToolUse hook command failed');
        }
      }
    }
  }

  async runSessionStart(sessionId: string): Promise<void> {
    const hooks = this.config.hooks.SessionStart || [];
    for (const hook of hooks) {
      if (hook.type === 'command' && hook.command) {
        try {
          const env = { ...process.env, SESSION_ID: sessionId };
          await this.runCommand(hook.command, env);
        } catch (err) {
          this.logger.warn({ err }, 'SessionStart hook failed');
        }
      }
    }
  }

  async runSessionEnd(sessionId: string): Promise<void> {
    const hooks = this.config.hooks.SessionEnd || [];
    for (const hook of hooks) {
      if (hook.type === 'command' && hook.command) {
        try {
          const env = { ...process.env, SESSION_ID: sessionId };
          await this.runCommand(hook.command, env);
        } catch (err) {
          this.logger.warn({ err }, 'SessionEnd hook failed');
        }
      }
    }
  }

  async runPreCompact(
    messageCount: number,
    tokenEstimate: number
  ): Promise<HookResult> {
    const hooks = this.config.hooks.PreCompact || [];
    for (const hook of hooks) {
      if (hook.type === 'command' && hook.command) {
        try {
          const env = {
            ...process.env,
            MESSAGE_COUNT: String(messageCount),
            TOKEN_ESTIMATE: String(tokenEstimate),
          };
          const { exitCode } = await this.runCommand(hook.command, env);
          if (exitCode === 2) {
            return { decision: 'deny', reason: 'Compaction blocked by hook' };
          }
        } catch (err) {
          this.logger.warn({ err }, 'PreCompact hook failed');
        }
      }
    }
    return { decision: 'allow' };
  }

  private isCommandBlocked(
    toolName: string,
    input: Record<string, unknown>
  ): boolean {
    const shellTools = ['shell_exec', 'execute_command', 'run_command'];
    if (!shellTools.includes(toolName)) return false;

    const cmd = this.extractCommand(toolName, input);
    if (!cmd) return false;

    return this.blockedPatterns.some(pattern => pattern.test(cmd));
  }

  private extractCommand(
    toolName: string,
    input: Record<string, unknown>
  ): string {
    return (input.command || input.cmd || input.script || '') as string;
  }

  private matchesTool(
    matcher: HookMatcher,
    toolName: string,
    input: Record<string, unknown>
  ): boolean {
    if (matcher.tool) {
      const toolPattern = new RegExp(
        `^${matcher.tool.replace(/\*/g, '.*')}$`
      );
      if (!toolPattern.test(toolName)) return false;
    }

    if (matcher.command) {
      const cmd = this.extractCommand(toolName, input);
      if (!cmd) return false;
      try {
        const cmdPattern = new RegExp(matcher.command, 'i');
        if (!cmdPattern.test(cmd)) return false;
      } catch {
        return false;
      }
    }

    return true;
  }

  private async runCommand(
    command: string,
    env: Record<string, string | undefined>
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        env: env as Record<string, string>,
        timeout: 5000,
        cwd: process.cwd(),
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (err: unknown) {
      const error = err as { code?: number; stdout?: string; stderr?: string };
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
      };
    }
  }

  getConfig(): HookConfig {
    return this.config;
  }

  updateConfig(config: HookConfig): void {
    this.config = config;
    this.blockedPatterns = this.buildBlockedPatterns();
  }
}

let globalHookEngine: HookEngine | null = null;

export function getHookEngine(configPath?: string): HookEngine {
  if (!globalHookEngine) {
    globalHookEngine = new HookEngine(configPath);
  }
  return globalHookEngine;
}

export function resetHookEngine(): void {
  globalHookEngine = null;
}
