import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { banner, heading, kv, success, fail, warn, blank, divider, colors as c } from '../ui.js';

const ENV_PATH = '.env';

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const content = readFileSync(ENV_PATH, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match?.[1] && match[2] !== undefined) {
      env[match[1].trim()] = match[2].trim();
    }
  }
  return env;
}

function writeEnvKey(key: string, value: string): void {
  const env = readEnv();
  env[key] = value;
  const content = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n';
  writeFileSync(ENV_PATH, content, 'utf-8');
}

function removeEnvKey(key: string): void {
  if (!existsSync(ENV_PATH)) return;
  const content = readFileSync(ENV_PATH, 'utf-8');
  const lines = content.split('\n').filter(line => {
    const match = line.match(/^([^#=]+)=/);
    return !match?.[1] || match[1].trim() !== key;
  });
  writeFileSync(ENV_PATH, lines.join('\n'), 'utf-8');
}

function prompt(question: string, _hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${c.cyan}?${c.reset} ${question}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const PLATFORM_ENV_KEYS: Record<string, string> = {
  github: 'GITHUB_TOKEN',
  gitlab: 'GITLAB_TOKEN',
  bitbucket: 'BITBUCKET_APP_PASSWORD',
} as const;

const PLATFORM_TOKEN_URLS: Record<string, string> = {
  github: 'https://github.com/settings/tokens/new',
  gitlab: 'https://gitlab.com/-/profile/personal_access_tokens',
  bitbucket: 'https://bitbucket.org/account/settings/app-passwords/',
} as const;

async function validateGitHubToken(token: string): Promise<{ valid: boolean; user?: string }> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (res.ok) {
      const data = await res.json() as { login: string };
      return { valid: true, user: data.login };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

async function validateGitLabToken(token: string): Promise<{ valid: boolean; user?: string }> {
  try {
    const res = await fetch('https://gitlab.com/api/v4/user', {
      headers: { 'PRIVATE-TOKEN': token },
    });
    if (res.ok) {
      const data = await res.json() as { username: string };
      return { valid: true, user: data.username };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

export const authCommand = new Command('auth')
  .description('Manage Git platform authentication');

authCommand
  .command('login <platform>')
  .description('Login to a Git platform (github, gitlab, bitbucket)')
  .action(async (platform: string) => {
    banner();

    const normalized = platform.toLowerCase();
    if (!['github', 'gitlab', 'bitbucket'].includes(normalized)) {
      fail(`Unknown platform: ${platform}. Use: github, gitlab, bitbucket`);
      blank();
      return;
    }

    heading(`Login to ${normalized}`);

    if (normalized === 'github') {
      let ghToken: string | null = null;
      try {
        ghToken = execSync('gh auth token', { encoding: 'utf-8' }).trim();
      } catch { /* gh not installed or not logged in */ }

      if (ghToken) {
        const validation = await validateGitHubToken(ghToken);
        if (validation.valid) {
          success(`GitHub CLI detected — user: ${c.cyan}${validation.user}${c.reset}`);
          blank();
          const answer = await prompt('Import token from gh CLI? (y/n)');
          if (answer.toLowerCase() === 'y') {
            writeEnvKey(PLATFORM_ENV_KEYS.github!, ghToken);
            success('Token imported from gh CLI');
            blank();
            return;
          }
        }
      }
    }

    const tokenUrl = PLATFORM_TOKEN_URLS[normalized] || '';
    console.log(`  ${c.dim}Generate a token at: ${c.cyan}${tokenUrl}${c.reset}`);
    blank();

    const token = await prompt(`Enter ${normalized} token`, true);
    if (!token) {
      warn('No token provided');
      blank();
      return;
    }

    if (normalized === 'github') {
      const validation = await validateGitHubToken(token);
      if (!validation.valid) {
        fail('Invalid GitHub token');
        blank();
        return;
      }
      success(`Authenticated as: ${c.cyan}${validation.user}${c.reset}`);
    } else if (normalized === 'gitlab') {
      const validation = await validateGitLabToken(token);
      if (!validation.valid) {
        fail('Invalid GitLab token');
        blank();
        return;
      }
      success(`Authenticated as: ${c.cyan}${validation.user}${c.reset}`);
    }

    const envKey = PLATFORM_ENV_KEYS[normalized] || normalized.toUpperCase() + '_TOKEN';
    writeEnvKey(envKey, token);
    if (normalized === 'bitbucket') {
      const username = await prompt('Enter Bitbucket username');
      writeEnvKey('BITBUCKET_USERNAME', username);
    }
    success(`${normalized} token saved to .env`);
    blank();
  });

authCommand
  .command('status')
  .description('Show authentication status for all platforms')
  .action(async () => {
    banner();
    heading('Authentication Status');

    const env = readEnv();

    for (const [platform, envKey] of Object.entries(PLATFORM_ENV_KEYS) as [string, string][]) {
      const token = env[envKey] || process.env[envKey];
      if (!token) {
        kv(platform, `${c.red}○${c.reset} not configured`);
        continue;
      }

      if (platform === 'github') {
        const validation = await validateGitHubToken(token);
        if (validation.valid) {
          kv(platform, `${c.green}●${c.reset} ${validation.user} (****${token.slice(-4)})`);
        } else {
          kv(platform, `${c.yellow}!${c.reset} token invalid`);
        }
      } else if (platform === 'gitlab') {
        const validation = await validateGitLabToken(token);
        if (validation.valid) {
          kv(platform, `${c.green}●${c.reset} ${validation.user} (****${token.slice(-4)})`);
        } else {
          kv(platform, `${c.yellow}!${c.reset} token invalid`);
        }
      } else {
        kv(platform, `${c.green}●${c.reset} configured (****${token.slice(-4)})`);
      }
    }

    blank();
    divider();
    blank();

    heading('Local Git Repositories');
    try {
      const { readdirSync, statSync } = await import('node:fs');
      const { join } = await import('node:path');

      const home = process.env.HOME || '/';
      const searchDirs = [
        join(home, 'Desktop'),
        join(home, 'Documents'),
        join(home, 'Projects'),
        join(home, 'repos'),
        join(home, 'dev'),
        join(home, 'src'),
      ];

      const repos: Array<{ path: string; platform: string }> = [];
      const visited = new Set<string>();

      for (const searchDir of searchDirs) {
        if (!existsSync(searchDir)) continue;
        try {
          for (const entry of readdirSync(searchDir)) {
            const entryPath = join(searchDir, entry);
            if (visited.has(entryPath)) continue;
            visited.add(entryPath);

            try {
              if (!statSync(entryPath).isDirectory()) continue;
              const gitConfigPath = join(entryPath, '.git', 'config');
              if (!existsSync(gitConfigPath)) continue;

              const gitConfig = readFileSync(gitConfigPath, 'utf-8');
              let platform = 'unknown';
              if (gitConfig.includes('github.com')) platform = 'github';
              else if (gitConfig.includes('gitlab.com')) platform = 'gitlab';
              else if (gitConfig.includes('bitbucket.org')) platform = 'bitbucket';

              repos.push({ path: entryPath.replace(home, '~'), platform });
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }

      if (repos.length === 0) {
        console.log(`  ${c.dim}No local repositories found${c.reset}`);
      } else {
        const grouped: Record<string, string[]> = {};
        for (const r of repos) {
          if (!grouped[r.platform]) grouped[r.platform] = [];
          grouped[r.platform]!.push(r.path);
        }
        for (const [platform, paths] of Object.entries(grouped)) {
          console.log(`  ${c.cyan}${platform}${c.reset} (${paths.length} repos)`);
          for (const p of paths.slice(0, 5)) {
            console.log(`    ${c.dim}${p}${c.reset}`);
          }
          if (paths.length > 5) {
            console.log(`    ${c.dim}...and ${paths.length - 5} more${c.reset}`);
          }
        }
      }
    } catch { /* ignore scan errors */ }
    blank();
  });

authCommand
  .command('logout <platform>')
  .description('Remove authentication for a platform')
  .action(async (platform: string) => {
    const normalized = platform.toLowerCase();
    if (!['github', 'gitlab', 'bitbucket'].includes(normalized)) {
      fail(`Unknown platform: ${platform}`);
      return;
    }

    const logoutKey = PLATFORM_ENV_KEYS[normalized] || normalized.toUpperCase() + '_TOKEN';
    removeEnvKey(logoutKey);
    if (normalized === 'bitbucket') {
      removeEnvKey('BITBUCKET_USERNAME');
    }
    success(`${normalized} token removed from .env`);
    blank();
  });
