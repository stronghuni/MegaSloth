import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { banner, statusLine, blank, divider } from '../ui.js';

export const statusCommand = new Command('status')
  .description('Show MegaSloth agent status')
  .action(async () => {
    banner();

    const configExists = existsSync('.megasloth/config.yaml');
    statusLine('Initialized', configExists, configExists ? 'yes' : 'no — run: megasloth init');

    const dbExists = existsSync('.megasloth/data/megasloth.db');
    statusLine('Database', dbExists, dbExists ? 'ready' : 'not created yet');

    let isRunning = false;
    const pidFile = '.megasloth/data/megasloth.pid';
    if (existsSync(pidFile)) {
      const pid = readFileSync(pidFile, 'utf-8').trim();
      try {
        process.kill(parseInt(pid, 10), 0);
        isRunning = true;
        statusLine('Agent', true, `running (PID: ${pid})`);
      } catch {
        statusLine('Agent', false, 'stopped (stale PID)');
      }
    } else {
      statusLine('Agent', false, 'stopped');
    }

    blank();
    divider();
    blank();

    try {
      const response = await fetch('http://localhost:13000/health');
      const data = await response.json();
      statusLine('HTTP API', true, 'healthy');
      const redisOk = (data as any)?.services?.redis === 'healthy';
      statusLine('Redis', redisOk, redisOk ? 'connected' : 'disconnected');
    } catch {
      statusLine('HTTP API', false, 'not reachable');
      statusLine('Redis', false, 'unknown');
    }

    blank();
  });
