import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const initCommand = new Command('init')
  .description('Initialize MegaSloth in the current directory')
  .option('-p, --provider <provider>', 'LLM provider (claude|openai|gemini)', 'claude')
  .action(async (options) => {
    console.log('\n  🦥 MegaSloth - AI-Powered Repository Operations Agent\n');

    const configDir = '.megasloth';
    const dataDir = join(configDir, 'data');
    const skillsDir = join(configDir, 'skills');

    if (existsSync(configDir)) {
      console.log('  ⚠  MegaSloth is already initialized in this directory.\n');
      return;
    }

    mkdirSync(dataDir, { recursive: true });
    mkdirSync(skillsDir, { recursive: true });

    const configContent = `# MegaSloth Configuration
server:
  httpPort: 13000
  webhookPort: 3001
  websocketPort: 18789

llm:
  provider: ${options.provider}
  # apiKey: your_api_key_here
  maxTokens: 4096

database:
  url: .megasloth/data/megasloth.db

redis:
  url: redis://localhost:6379

# github:
#   token: ghp_xxxxx
#   webhookSecret: your_secret

# gitlab:
#   token: glpat-xxxxx
#   url: https://gitlab.com

# slack:
#   botToken: xoxb-xxxxx
#   defaultChannel: dev-alerts

logging:
  level: info
  pretty: true
`;

    writeFileSync(join(configDir, 'config.yaml'), configContent);

    const envContent = `# MegaSloth Environment
LLM_PROVIDER=${options.provider}
# LLM_API_KEY=your_api_key

# GITHUB_TOKEN=ghp_xxxxx
# GITHUB_WEBHOOK_SECRET=your_secret

REDIS_URL=redis://localhost:6379
HTTP_PORT=13000
WEBHOOK_PORT=3001
LOG_LEVEL=info
`;

    if (!existsSync('.env')) {
      writeFileSync('.env', envContent);
    }

    console.log('  ✓  Created .megasloth/ directory');
    console.log('  ✓  Created .megasloth/config.yaml');
    console.log('  ✓  Created .megasloth/skills/ directory');
    console.log('  ✓  Created .megasloth/data/ directory');
    if (!existsSync('.env')) {
      console.log('  ✓  Created .env file');
    }

    console.log('\n  Next steps:');
    console.log('  1. Edit .megasloth/config.yaml or .env with your API keys');
    console.log('  2. Start Redis: redis-server');
    console.log('  3. Run: megasloth start');
    console.log('  4. Configure webhooks on your Git platform\n');
  });
