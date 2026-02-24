import { platform } from 'node:os';
import { type ToolRegistry } from './registry.js';
import { shellExec } from './shell/process-manager.js';

const os = platform();

export function registerSystemTools(registry: ToolRegistry): void {
  registry.register({
    category: 'system',
    definition: {
      name: 'system_screenshot',
      description: 'Capture a screenshot of the desktop screen.',
      input_schema: {
        type: 'object',
        properties: { output_path: { type: 'string', description: 'Output file path (default: /tmp/screenshot.png)' } },
      },
    },
    handler: async (input) => {
      const outPath = (input.output_path as string) || '/tmp/megasloth_screenshot.png';
      let cmd: string;
      if (os === 'darwin') {
        cmd = `screencapture -x ${outPath}`;
      } else {
        cmd = `scrot ${outPath} 2>/dev/null || gnome-screenshot -f ${outPath} 2>/dev/null || import -window root ${outPath}`;
      }
      const result = await shellExec(cmd, { timeout: 10 });
      return result.exitCode === 0 ? `Screenshot saved: ${outPath}` : `Failed: ${result.stderr}`;
    },
  });

  registry.register({
    category: 'system',
    definition: {
      name: 'system_clipboard_read',
      description: 'Read the current clipboard content.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async () => {
      const cmd = os === 'darwin' ? 'pbpaste' : 'xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output';
      const result = await shellExec(cmd, { timeout: 5 });
      return result.stdout || '(clipboard empty)';
    },
  });

  registry.register({
    category: 'system',
    definition: {
      name: 'system_clipboard_write',
      description: 'Write text to the clipboard.',
      input_schema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'Text to copy' } },
        required: ['text'],
      },
    },
    handler: async (input) => {
      const text = input.text as string;
      const cmd = os === 'darwin'
        ? `echo ${JSON.stringify(text)} | pbcopy`
        : `echo ${JSON.stringify(text)} | xclip -selection clipboard 2>/dev/null || echo ${JSON.stringify(text)} | xsel --clipboard --input`;
      const result = await shellExec(cmd, { timeout: 5 });
      return result.exitCode === 0 ? 'Copied to clipboard' : `Failed: ${result.stderr}`;
    },
  });

  registry.register({
    category: 'system',
    definition: {
      name: 'system_notify',
      description: 'Send an OS-level notification.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Notification title' },
          message: { type: 'string', description: 'Notification body' },
        },
        required: ['title', 'message'],
      },
    },
    handler: async (input) => {
      const title = input.title as string;
      const message = input.message as string;
      let cmd: string;
      if (os === 'darwin') {
        cmd = `osascript -e 'display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}'`;
      } else {
        cmd = `notify-send ${JSON.stringify(title)} ${JSON.stringify(message)}`;
      }
      const result = await shellExec(cmd, { timeout: 5 });
      return result.exitCode === 0 ? 'Notification sent' : `Failed: ${result.stderr}`;
    },
  });

  registry.register({
    category: 'system',
    definition: {
      name: 'system_open',
      description: 'Open a file or URL with the default application.',
      input_schema: {
        type: 'object',
        properties: { target: { type: 'string', description: 'File path or URL to open' } },
        required: ['target'],
      },
    },
    handler: async (input) => {
      const target = input.target as string;
      const cmd = os === 'darwin' ? `open ${JSON.stringify(target)}` : `xdg-open ${JSON.stringify(target)}`;
      const result = await shellExec(cmd, { timeout: 10 });
      return result.exitCode === 0 ? `Opened: ${target}` : `Failed: ${result.stderr}`;
    },
  });
}
