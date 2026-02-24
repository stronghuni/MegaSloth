import { Command } from 'commander';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { banner, success, info, blank } from '../ui.js';

export const stopCommand = new Command('stop')
  .description('Stop the MegaSloth agent')
  .action(async () => {
    banner();

    const pidFile = '.megasloth/data/megasloth.pid';
    if (!existsSync(pidFile)) {
      info('Agent is not running.');
      blank();
      return;
    }

    try {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      process.kill(pid, 'SIGTERM');
      unlinkSync(pidFile);
      success(`Stopped agent (PID: ${pid})`);
    } catch {
      info('Agent process not found. It may have already stopped.');
      if (existsSync(pidFile)) unlinkSync(pidFile);
    }
    blank();
  });
