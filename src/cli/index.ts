#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { configCommand } from './commands/config.js';
import { skillCommand } from './commands/skill.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('megasloth')
  .description('MegaSloth - AI-Powered Repository Operations Agent')
  .version('1.0.0');

program.addCommand(initCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(configCommand);
program.addCommand(skillCommand);
program.addCommand(statusCommand);

program.parse();
