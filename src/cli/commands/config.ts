import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { banner, heading, kv, info, blank, divider } from '../ui.js';

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

    heading('Server');
    kv('HTTP Port', String(config?.server?.httpPort || 13000));
    kv('Webhook Port', String(config?.server?.webhookPort || 3001));
    kv('WebSocket Port', String(config?.server?.websocketPort || 18789));

    blank();
    divider();
    blank();

    heading('LLM');
    kv('Provider', config?.llm?.provider || 'claude');
    kv('API Key', config?.llm?.apiKey ? '****' + config.llm.apiKey.slice(-4) : 'not set');

    blank();
    divider();
    blank();

    heading('Git Platforms');
    kv('GitHub', config?.github?.token ? 'configured' : 'not configured');
    kv('GitLab', config?.gitlab?.token ? 'configured' : 'not configured');
    kv('Bitbucket', config?.bitbucket?.username ? 'configured' : 'not configured');

    blank();
  });

configCommand
  .command('path')
  .description('Show config file path')
  .action(() => {
    console.log('.megasloth/config.yaml');
  });
