import { resolve, relative, isAbsolute } from 'node:path';
import { getLogger } from '../utils/logger.js';
import { type ToolCategory } from '../tools/registry.js';

const logger = getLogger('security');

export type SecurityProfile = 'restricted' | 'standard' | 'full';

interface SecurityConfig {
  profile: SecurityProfile;
  workspaceRoot: string;
  allowedCategories: ToolCategory[];
  blockedCommands: RegExp[];
  allowOutsideWorkspace: boolean;
  maxCommandTimeout: number;
  requireConfirmation: ToolCategory[];
}

const PROFILES: Record<SecurityProfile, Omit<SecurityConfig, 'workspaceRoot'>> = {
  restricted: {
    profile: 'restricted',
    allowedCategories: ['git', 'pr', 'ci', 'issue', 'code', 'release', 'memory'],
    blockedCommands: [/rm\s+-rf/, /sudo/, /chmod/, /chown/, /mkfs/, /dd\s+if/, /shutdown/, /reboot/, /kill\s+-9/],
    allowOutsideWorkspace: false,
    maxCommandTimeout: 60,
    requireConfirmation: ['deploy', 'env', 'credential'],
  },
  standard: {
    profile: 'standard',
    allowedCategories: ['git', 'pr', 'ci', 'issue', 'code', 'release', 'deploy', 'env',
      'shell', 'filesystem', 'web', 'memory', 'session', 'credential'],
    blockedCommands: [/rm\s+-rf\s+\/(?!\w)/, /mkfs/, /dd\s+if=.*of=\/dev/, /shutdown/, /reboot/],
    allowOutsideWorkspace: false,
    maxCommandTimeout: 300,
    requireConfirmation: ['deploy'],
  },
  full: {
    profile: 'full',
    allowedCategories: ['git', 'pr', 'ci', 'issue', 'code', 'release', 'deploy', 'env',
      'shell', 'filesystem', 'web', 'browser', 'system', 'credential', 'memory', 'session'],
    blockedCommands: [/:\(\)\{\s*:\|:&\s*\};:/, /mkfs\s+\/dev\/sd[a-z]$/],
    allowOutsideWorkspace: true,
    maxCommandTimeout: 600,
    requireConfirmation: [],
  },
};

let activeConfig: SecurityConfig | null = null;

export function initSecurity(profile: SecurityProfile = 'standard', workspaceRoot?: string): SecurityConfig {
  const profileConfig = PROFILES[profile];
  activeConfig = {
    ...profileConfig,
    workspaceRoot: workspaceRoot || process.cwd(),
  };
  logger.info({ profile, workspaceRoot: activeConfig.workspaceRoot }, 'Security initialized');
  return activeConfig;
}

export function getSecurityConfig(): SecurityConfig {
  if (!activeConfig) return initSecurity();
  return activeConfig;
}

export function isToolAllowed(category: ToolCategory): boolean {
  const config = getSecurityConfig();
  return config.allowedCategories.includes(category);
}

export function isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
  const config = getSecurityConfig();
  for (const pattern of config.blockedCommands) {
    if (pattern.test(command)) {
      return { allowed: false, reason: `Command matches blocked pattern: ${pattern.source}` };
    }
  }
  return { allowed: true };
}

export function isPathAllowed(targetPath: string): boolean {
  const config = getSecurityConfig();
  if (config.allowOutsideWorkspace) return true;

  const absPath = isAbsolute(targetPath) ? targetPath : resolve(config.workspaceRoot, targetPath);
  const rel = relative(config.workspaceRoot, absPath);
  return !rel.startsWith('..');
}

export function requiresConfirmation(category: ToolCategory): boolean {
  const config = getSecurityConfig();
  return config.requireConfirmation.includes(category);
}
