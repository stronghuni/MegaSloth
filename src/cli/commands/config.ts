import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { banner, heading, kv, info, success, fail, warn, blank, divider, colors as c } from '../ui.js';

const ENV_PATH = '.env';

function readEnvFile(): Record<string, string> {
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

function writeEnvValue(key: string, value: string): void {
  if (!existsSync(ENV_PATH)) {
    writeFileSync(ENV_PATH, `${key}=${value}\n`, 'utf-8');
    return;
  }
  const content = readFileSync(ENV_PATH, 'utf-8');
  const lines = content.split('\n');
  let found = false;
  const updated = lines.map(line => {
    const match = line.match(/^([^#=]+)=/);
    if (match?.[1] && match[1].trim() === key) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) updated.push(`${key}=${value}`);
  writeFileSync(ENV_PATH, updated.join('\n'), 'utf-8');
}

export const configCommand = new Command('config')
  .description('Manage MegaSloth configuration');

configCommand
  .command('show')
  .description('Show current configuration')
  .action(async () => {
    banner();

    const configPath = '.megasloth/config.yaml';
    if (!existsSync(configPath)) {
      info('No config found. Run: megasloth init');
      blank();
      return;
    }

    const content = readFileSync(configPath, 'utf-8');
    const config = parseYaml(content);

    const env = readEnvFile();
    const activeProvider = env.LLM_PROVIDER || config?.llm?.provider || 'claude';

    heading('Server');
    kv('HTTP Port', String(config?.server?.httpPort || 13000));
    kv('Webhook Port', String(config?.server?.webhookPort || 3001));
    kv('WebSocket Port', String(config?.server?.websocketPort || 18789));

    blank();
    divider();
    blank();

    heading('LLM');
    kv('Provider', `${c.cyan}${activeProvider}${c.reset}`);
    kv('Model', env.LLM_MODEL || config?.llm?.model || '(default)');

    const providers = ['claude', 'openai', 'gemini'] as const;
    const apiKeyMap: Record<string, string> = {
      claude: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      gemini: 'GEMINI_API_KEY',
    };
    for (const p of providers) {
      const envKeyName = apiKeyMap[p] || '';
      const key = env[envKeyName] || process.env[envKeyName];
      const isActive = p === activeProvider;
      const icon = key ? (isActive ? `${c.green}●${c.reset}` : `${c.dim}●${c.reset}`) : `${c.red}○${c.reset}`;
      kv(`  ${p}`, `${icon} ${key ? 'configured' : 'not set'}${isActive ? ` ${c.cyan}(active)${c.reset}` : ''}`);
    }

    blank();
    divider();
    blank();

    heading('Git Platforms');
    kv('GitHub', (env.GITHUB_TOKEN || config?.github?.token) ? 'configured' : 'not configured');
    kv('GitLab', (env.GITLAB_TOKEN || config?.gitlab?.token) ? 'configured' : 'not configured');
    kv('Bitbucket', (env.BITBUCKET_APP_PASSWORD || config?.bitbucket?.username) ? 'configured' : 'not configured');

    blank();
  });

configCommand
  .command('path')
  .description('Show config file path')
  .action(() => {
    console.log('.megasloth/config.yaml');
  });

configCommand
  .command('provider [name]')
  .description('Get or set the active LLM provider (claude, openai, gemini)')
  .action(async (name?: string) => {
    const validProviders = ['claude', 'openai', 'gemini'];

    if (!name) {
      const env = readEnvFile();
      const current = env.LLM_PROVIDER || process.env.LLM_PROVIDER || 'claude';
      console.log(`  Active provider: ${c.cyan}${current}${c.reset}`);
      blank();
      console.log(`  ${c.dim}Available: ${validProviders.join(', ')}${c.reset}`);
      console.log(`  ${c.dim}Usage: megasloth config provider <name>${c.reset}`);
      blank();
      return;
    }

    if (!validProviders.includes(name)) {
      fail(`Invalid provider: ${name}. Choose from: ${validProviders.join(', ')}`);
      blank();
      return;
    }

    const providerApiKeyMap: Record<string, string> = {
      claude: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      gemini: 'GEMINI_API_KEY',
    };

    const env = readEnvFile();
    const envKeyForProvider = providerApiKeyMap[name] || '';
    const apiKey = env[envKeyForProvider] || process.env[envKeyForProvider];
    if (!apiKey) {
      warn(`No API key found for ${name}. Set ${envKeyForProvider} in .env first.`);
      blank();
      return;
    }

    writeEnvValue('LLM_PROVIDER', name);
    success(`Provider switched to ${c.cyan}${name}${c.reset}`);
    blank();
  });

configCommand
  .command('model [name]')
  .description('Get or set the active LLM model')
  .action(async (name?: string) => {
    if (!name) {
      const env = readEnvFile();
      const current = env.LLM_MODEL || process.env.LLM_MODEL || '(provider default)';
      const provider = env.LLM_PROVIDER || process.env.LLM_PROVIDER || 'claude';
      console.log(`  Active model: ${c.cyan}${current}${c.reset} (${provider})`);
      blank();

      const defaultModels: Record<string, string> = {
        claude: 'claude-sonnet-4-6',
        openai: 'gpt-5.2',
        gemini: 'gemini-2.5-pro',
      };
      console.log(`  ${c.dim}Default models:${c.reset}`);
      for (const [p, m] of Object.entries(defaultModels)) {
        const active = p === provider ? ` ${c.cyan}(active)${c.reset}` : '';
        console.log(`    ${c.dim}${p}:${c.reset} ${m}${active}`);
      }
      blank();
      console.log(`  ${c.dim}Usage: megasloth config model <model-name>${c.reset}`);
      blank();
      return;
    }

    writeEnvValue('LLM_MODEL', name);
    success(`Model set to ${c.cyan}${name}${c.reset}`);
    blank();
  });
