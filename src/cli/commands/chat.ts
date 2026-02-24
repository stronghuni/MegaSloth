import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { banner, blank, colors as c, divider } from '../ui.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function createSpinner(label: string) {
  let frame = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    start() {
      timer = setInterval(() => {
        process.stdout.write(`\r  ${c.cyan}${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]}${c.reset} ${c.dim}${label}${c.reset}`);
        frame++;
      }, 80);
    },
    update(newLabel: string) {
      label = newLabel;
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
    },
  };
}

async function handleSSEChat(
  port: number | string,
  message: string,
  sessionId: string
): Promise<void> {
  const res = await fetch(`http://localhost:${port}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId, stream: true }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.log(`  ${c.red}Error: ${res.status} ${text}${c.reset}`);
    return;
  }

  if (!res.body) {
    console.log(`  ${c.red}No response body${c.reset}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new globalThis.TextDecoder();
  let buffer = '';
  let textStarted = false;
  let spinner: ReturnType<typeof createSpinner> | null = null;
  let toolCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);
          switch (event.type) {
            case 'text_delta': {
              if (spinner) {
                spinner.stop();
                spinner = null;
              }
              if (!textStarted) {
                blank();
                process.stdout.write(`  ${c.green}${c.bold}MegaSloth${c.reset}  `);
                textStarted = true;
              }
              process.stdout.write(event.text);
              break;
            }

            case 'tool_start': {
              if (textStarted) {
                process.stdout.write('\n');
                textStarted = false;
              }
              toolCount++;
              const toolLabel = `[${toolCount}] ${event.tool}`;
              spinner = createSpinner(toolLabel);
              spinner.start();
              break;
            }

            case 'tool_done': {
              if (spinner) {
                spinner.stop();
                spinner = null;
              }
              const icon = event.isError ? `${c.red}✗${c.reset}` : `${c.green}✓${c.reset}`;
              const duration = `${c.dim}${event.durationMs}ms${c.reset}`;
              console.log(`  ${icon} ${c.cyan}${event.tool}${c.reset} ${duration}`);
              break;
            }

            case 'tool_blocked': {
              if (spinner) {
                spinner.stop();
                spinner = null;
              }
              console.log(`  ${c.red}⊘${c.reset} ${c.yellow}${event.tool}${c.reset} ${c.dim}blocked: ${event.reason}${c.reset}`);
              break;
            }

            case 'turn_complete': {
              break;
            }

            case 'error': {
              if (spinner) {
                spinner.stop();
                spinner = null;
              }
              console.log(`\n  ${c.red}Error: ${event.error}${c.reset}`);
              break;
            }

            case 'done': {
              if (textStarted) {
                process.stdout.write('\n');
              }
              if (event.toolsExecuted?.length > 0) {
                blank();
                console.log(`  ${c.dim}Tools: ${event.toolsExecuted.join(', ')} | Turns: ${event.turns} | Tokens: ${(event.usage?.input || 0) + (event.usage?.output || 0)}${c.reset}`);
              }
              break;
            }
          }
        } catch {
          // skip unparseable SSE lines
        }
      }
    }
  } finally {
    if (spinner) spinner.stop();
  }
}

export const chatCommand = new Command('chat')
  .description('Interactive chat with the MegaSloth agent')
  .action(async () => {
    banner();
    console.log(`  ${c.dim}Type a message to interact with MegaSloth.${c.reset}`);
    console.log(`  ${c.dim}Commands: /status, /tools, /skills, /compact, /clear, /exit${c.reset}`);
    console.log(`  ${c.dim}${c.italic}Slow is smooth, smooth is fast.${c.reset}`);
    blank();
    divider();
    blank();

    let apiAvailable = false;
    const port = process.env.HTTP_PORT || 13000;
    const sessionId = randomUUID();

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
        console.log(`  ${c.dim}Going back to sleep... Goodbye.${c.reset}`);
        blank();
        rl.close();
        return;
      }

      if (input === '/clear') {
        try {
          await fetch(`http://localhost:${port}/api/chat`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
        } catch { /* ignore */ }
        console.clear();
        banner();
        console.log(`  ${c.green}✓${c.reset} Chat history cleared`);
        blank();
        rl.prompt();
        return;
      }

      if (input === '/status') {
        try {
          const res = await fetch(`http://localhost:${port}/health`);
          const data = await res.json() as Record<string, unknown>;
          blank();
          console.log(`  ${c.green}●${c.reset} Agent is running`);
          console.log(`  ${c.dim}Session: ${sessionId.substring(0, 8)}...${c.reset}`);
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
        blank();
        console.log(`  ${c.white}${c.bold}Available tool categories${c.reset}`);
        const categories = [
          'git', 'pr', 'ci', 'issue', 'code', 'release', 'deploy', 'env',
          'shell', 'filesystem', 'web', 'browser', 'system', 'credential', 'memory', 'session',
        ];
        for (const cat of categories) {
          console.log(`  ${c.cyan}●${c.reset} ${cat}`);
        }
        blank();
        rl.prompt();
        return;
      }

      if (input === '/skills') {
        try {
          const res = await fetch(`http://localhost:${port}/api/skills`);
          const data = await res.json() as { skills: Array<{ name: string; description: string; enabled: boolean }> };
          blank();
          console.log(`  ${c.white}${c.bold}Available skills${c.reset}`);
          for (const skill of data.skills) {
            const icon = skill.enabled ? `${c.green}●${c.reset}` : `${c.red}○${c.reset}`;
            console.log(`  ${icon} ${c.cyan}/${skill.name}${c.reset} — ${c.dim}${skill.description}${c.reset}`);
          }
          blank();
        } catch {
          console.log(`  ${c.yellow}!${c.reset} Cannot fetch skills. Is agent running?`);
          blank();
        }
        rl.prompt();
        return;
      }

      if (input === '/compact') {
        try {
          blank();
          console.log(`  ${c.dim}Compacting context...${c.reset}`);
          const res = await fetch(`http://localhost:${port}/api/chat/compact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          const data = await res.json() as Record<string, unknown>;
          if (data.compacted) {
            console.log(`  ${c.green}✓${c.reset} Compacted ${data.messagesCompacted} messages (${data.originalTokens} → ${data.compactedTokens} tokens)`);
          } else {
            console.log(`  ${c.dim}Nothing to compact${c.reset}`);
          }
          blank();
      } catch {
        console.log(`  ${c.red}Compaction failed${c.reset}`);
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
        await handleSSEChat(port, input, sessionId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ${c.red}Connection error: ${msg}${c.reset}`);
      }
      blank();
      rl.prompt();
    });

    rl.on('close', () => {
      process.exit(0);
    });
  });
