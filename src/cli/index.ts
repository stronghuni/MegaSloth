#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { configCommand } from './commands/config.js';
import { skillCommand } from './commands/skill.js';
import { statusCommand } from './commands/status.js';
import { chatCommand } from './commands/chat.js';
import { authCommand } from './commands/auth.js';
import { updateCommand, checkForUpdatesQuiet } from './commands/update.js';
import { banner, cmd, blank, hint, divider } from './ui.js';

const program = new Command();

program
  .name('megasloth')
  .description('MegaSloth — AI-Powered Full Automation Agent')
  .version('1.0.0')
  .action(() => {
    banner();
    divider();
    blank();
    cmd('megasloth init', 'Initialize in current directory');
    cmd('megasloth start', 'Start the agent');
    cmd('megasloth chat', 'Interactive chat with the agent');
    cmd('megasloth status', 'Show agent status');
    cmd('megasloth stop', 'Stop the agent');
    cmd('megasloth auth login', 'Login to Git platforms');
    cmd('megasloth auth status', 'Show auth status');
    cmd('megasloth config show', 'Show configuration');
    cmd('megasloth config provider', 'Switch LLM provider');
    cmd('megasloth config model', 'Switch LLM model');
    cmd('megasloth skill list', 'List available skills');
    cmd('megasloth update', 'Check for updates');
    blank();
    hint('Slow is smooth, smooth is fast.');
    blank();

    checkForUpdatesQuiet();
  });

program.addCommand(initCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(configCommand);
program.addCommand(skillCommand);
program.addCommand(statusCommand);
program.addCommand(chatCommand);
program.addCommand(authCommand);
program.addCommand(updateCommand);

program.parse();
