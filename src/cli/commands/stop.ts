import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';

export const stopCommand = new Command('stop')
  .description('Stop the MegaSloth agent')
  .action(async () => {
    const pidFile = '.megasloth/data/megasloth.pid';
    if (!existsSync(pidFile)) {
      console.log('  MegaSloth is not running (no PID file found).');
      return;
    }

    try {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      process.kill(pid, 'SIGTERM');
      console.log(`  ✓  Sent stop signal to MegaSloth (PID: ${pid})`);
    } catch (error) {
      console.log('  MegaSloth process not found. It may have already stopped.');
    }
  });
