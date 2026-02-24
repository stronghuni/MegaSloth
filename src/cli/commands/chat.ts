import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { banner, blank, colors as c, divider } from '../ui.js';

export const chatCommand = new Command('chat')
  .description('Interactive chat with the MegaSloth agent')
  .action(async () => {
    banner();
    console.log(`  ${c.dim}Type a message to interact with MegaSloth.${c.reset}`);
    console.log(`  ${c.dim}Commands: /status, /tools, /clear, /exit${c.reset}`);
    console.log(`  ${c.dim}${c.italic}Slow is smooth, smooth is fast. 🦥${c.reset}`);
    blank();
    divider();
    blank();

    let apiAvailable = false;
    const port = process.env.HTTP_PORT || 13000;

    try {
      const res = await fetch(`http://localhost:${port}/health`);
      apiAvailable = res.ok;
    } catch { /* agent not running */ }

    if (!apiAvailable) {
      console.log(`  ${c.yellow}!${c.reset} Agent is not running. Start it first: ${c.cyan}megasloth start${c.reset}`);
      blank();
      console.log(`  ${c.dim}Starting in offline mode — commands only, no AI responses.${c.reset}`);
      blank();
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${c.cyan}  > ${c.reset}`,
      terminal: true,
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();

      if (!input) {
        rl.prompt();
        return;
      }

      if (input === '/exit' || input === '/quit') {
        blank();
        console.log(`  ${c.dim}🦥 Going back to sleep... Goodbye.${c.reset}`);
        blank();
        rl.close();
        return;
      }

      if (input === '/clear') {
        console.clear();
        banner();
        rl.prompt();
        return;
      }

      if (input === '/status') {
        try {
          const res = await fetch(`http://localhost:${port}/health`);
          const data = await res.json() as any;
          blank();
          console.log(`  ${c.green}●${c.reset} Agent is running`);
          console.log(`  ${c.dim}Services: ${JSON.stringify(data.services || {})}${c.reset}`);
          blank();
        } catch {
          blank();
          console.log(`  ${c.red}○${c.reset} Agent is not reachable`);
          blank();
        }
        rl.prompt();
        return;
      }

      if (input === '/tools') {
        try {
          const res = await fetch(`http://localhost:${port}/api/config`);
          await res.json();
          blank();
          console.log(`  ${c.white}${c.bold}Available tool categories${c.reset}`);
          const categories = ['git', 'pr', 'ci', 'issue', 'code', 'release', 'deploy', 'env',
            'shell', 'filesystem', 'web', 'browser', 'system', 'credential', 'memory', 'session'];
          for (const cat of categories) {
            console.log(`  ${c.cyan}●${c.reset} ${cat}`);
          }
          blank();
        } catch {
          blank();
          console.log(`  ${c.yellow}!${c.reset} Connect to agent for tool info: megasloth start`);
          blank();
        }
        rl.prompt();
        return;
      }

      if (!apiAvailable) {
        blank();
        console.log(`  ${c.dim}Agent offline. Start with: megasloth start${c.reset}`);
        blank();
        rl.prompt();
        return;
      }

      try {
        blank();
        console.log(`  ${c.dim}🦥 Thinking slowly...${c.reset}`);

        const res = await fetch(`http://localhost:${port}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: input }),
        });

        if (res.ok) {
          const data = await res.json() as any;
          blank();
          console.log(`  ${c.green}${c.bold}🦥 MegaSloth${c.reset}`);
          const response = data.response || data.message || JSON.stringify(data);
          for (const line of response.split('\n')) {
            console.log(`  ${line}`);
          }
        } else {
          console.log(`  ${c.red}Error: ${res.status} ${res.statusText}${c.reset}`);
        }
      } catch (err: any) {
        console.log(`  ${c.red}Connection error: ${err.message}${c.reset}`);
      }
      blank();
      rl.prompt();
    });

    rl.on('close', () => {
      process.exit(0);
    });
  });
