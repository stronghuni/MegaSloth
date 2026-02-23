import { Command } from 'commander';

export const startCommand = new Command('start')
  .description('Start the MegaSloth agent')
  .option('-d, --daemon', 'Run as background daemon')
  .action(async (options) => {
    console.log('\n  🦥 Starting MegaSloth...\n');

    try {
      const { createMegaSloth } = await import('../../index.js');
      const bot = await createMegaSloth();

      const shutdown = async (signal: string) => {
        console.log(`\n  Received ${signal}, shutting down...`);
        await bot.stop();
        process.exit(0);
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));

      await bot.start();
      console.log('  ✓  MegaSloth is running!\n');
    } catch (error) {
      console.error('  ✗  Failed to start:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
