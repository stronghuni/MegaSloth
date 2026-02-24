import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { banner, success, fail, info, blank, colors as c } from '../ui.js';

export const startCommand = new Command('start')
  .description('Start the MegaSloth agent')
  .option('-d, --daemon', 'Run as background daemon')
  .action(async (options: { daemon?: boolean }) => {
    banner();

    if (options.daemon) {
      info('Starting agent as background daemon...');
      blank();

      try {
        const { fork } = await import('node:child_process');
        const corePath = join(import.meta.dirname, '../../index.js');
        const child = fork(corePath, [], {
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, MEGASLOTH_DAEMON: 'true' },
        });
        child.unref();

        const pidFile = join(process.cwd(), '.megasloth', 'data', 'agent.pid');
        writeFileSync(pidFile, String(child.pid), 'utf-8');

        success(`Agent started as daemon (PID: ${child.pid})`);
        blank();
        console.log(`  ${c.dim}Stop with: ${c.reset}${c.cyan}megasloth stop${c.reset}`);
        blank();
      } catch (error) {
        fail(`Failed to start daemon: ${error instanceof Error ? error.message : error}`);
        blank();
        process.exit(1);
      }
      return;
    }

    info('Starting agent...');
    blank();

    try {
      const { createMegaSloth } = await import('../../index.js');
      const bot = await createMegaSloth();

      const shutdown = async (signal: string) => {
        blank();
        info(`Received ${signal}, shutting down gracefully...`);
        await bot.stop();
        success('Agent stopped');
        blank();
        process.exit(0);
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));

      await bot.start();
      success('Agent is running');
      blank();
      console.log(`  ${c.dim}Press ${c.reset}${c.bold}Ctrl+C${c.reset}${c.dim} to stop${c.reset}`);
      blank();
    } catch (error) {
      fail(`Failed to start: ${error instanceof Error ? error.message : error}`);
      blank();
      process.exit(1);
    }
  });
