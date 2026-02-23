import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';

export const statusCommand = new Command('status')
  .description('Show MegaSloth agent status')
  .action(async () => {
    console.log('\n  🦥 MegaSloth Status\n');

    const configExists = existsSync('.megasloth/config.yaml');
    console.log(`  Initialized: ${configExists ? '✓ yes' : '✗ no (run: megasloth init)'}`);

    const dbExists = existsSync('.megasloth/data/megasloth.db');
    console.log(`  Database:    ${dbExists ? '✓ exists' : '✗ not created yet'}`);

    const pidFile = '.megasloth/data/megasloth.pid';
    if (existsSync(pidFile)) {
      const pid = readFileSync(pidFile, 'utf-8').trim();
      try {
        process.kill(parseInt(pid, 10), 0);
        console.log(`  Running:     ✓ yes (PID: ${pid})`);
      } catch {
        console.log('  Running:     ✗ no (stale PID file)');
      }
    } else {
      console.log('  Running:     ✗ no');
    }

    try {
      const response = await fetch('http://localhost:13000/health');
      const data = await response.json();
      console.log(`  HTTP API:    ✓ healthy`);
      console.log(`  Redis:       ${(data as any)?.services?.redis === 'healthy' ? '✓ connected' : '✗ disconnected'}`);
    } catch {
      console.log('  HTTP API:    ✗ not reachable');
    }

    console.log('');
  });
