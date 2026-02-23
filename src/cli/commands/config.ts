import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

export const configCommand = new Command('config')
  .description('Manage MegaSloth configuration');

configCommand
  .command('show')
  .description('Show current configuration')
  .action(async () => {
    const configPath = '.megasloth/config.yaml';
    if (!existsSync(configPath)) {
      console.log('  No config found. Run: megasloth init');
      return;
    }

    const content = readFileSync(configPath, 'utf-8');
    const config = parseYaml(content);

    console.log('\n  🦥 MegaSloth Configuration\n');
    console.log('  Server:');
    console.log(`    HTTP Port:      ${config?.server?.httpPort || 13000}`);
    console.log(`    Webhook Port:   ${config?.server?.webhookPort || 3001}`);
    console.log(`    WebSocket Port: ${config?.server?.websocketPort || 18789}`);
    console.log('\n  LLM:');
    console.log(`    Provider: ${config?.llm?.provider || 'claude'}`);
    console.log(`    API Key:  ${config?.llm?.apiKey ? '****' + config.llm.apiKey.slice(-4) : 'not set'}`);
    console.log('\n  Git Platforms:');
    console.log(`    GitHub:    ${config?.github?.token ? 'configured' : 'not configured'}`);
    console.log(`    GitLab:    ${config?.gitlab?.token ? 'configured' : 'not configured'}`);
    console.log(`    Bitbucket: ${config?.bitbucket?.username ? 'configured' : 'not configured'}`);
    console.log('');
  });

configCommand
  .command('path')
  .description('Show config file path')
  .action(() => {
    console.log('.megasloth/config.yaml');
  });
