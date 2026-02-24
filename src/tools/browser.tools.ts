import { type ToolRegistry } from './registry.js';
import * as bm from './browser/browser-manager.js';

export function registerBrowserTools(registry: ToolRegistry): void {
  registry.register({
    category: 'browser',
    definition: {
      name: 'browser_launch',
      description: 'Launch or ensure browser is running. Returns status.',
      input_schema: {
        type: 'object',
        properties: { headless: { type: 'boolean', description: 'Headless mode (default: true)' } },
      },
    },
    handler: async (input) => {
      await bm.ensureBrowser(input.headless as boolean ?? true);
      return 'Browser launched';
    },
  });

  registry.register({
    category: 'browser',
    definition: {
      name: 'browser_navigate',
      description: 'Navigate to a URL in the browser.',
      input_schema: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL to navigate to' } },
        required: ['url'],
      },
    },
    handler: async (input) => {
      const result = await bm.navigate(input.url as string);
      return JSON.stringify(result);
    },
  });

  registry.register({
    category: 'browser',
    definition: {
      name: 'browser_click',
      description: 'Click an element on the page by CSS selector or text.',
      input_schema: {
        type: 'object',
        properties: { selector: { type: 'string', description: 'CSS selector or text selector (e.g. "text=Submit")' } },
        required: ['selector'],
      },
    },
    handler: async (input) => bm.click(input.selector as string),
  });

  registry.register({
    category: 'browser',
    definition: {
      name: 'browser_type',
      description: 'Type text into an input field. Clears existing content first.',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of input element' },
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['selector', 'text'],
      },
    },
    handler: async (input) => bm.type(input.selector as string, input.text as string),
  });

  registry.register({
    category: 'browser',
    definition: {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current page. Returns metadata about the captured image.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async () => {
      const buf = await bm.screenshot();
      return `Screenshot captured: ${buf.length} bytes (PNG)`;
    },
  });

  registry.register({
    category: 'browser',
    definition: {
      name: 'browser_snapshot',
      description: 'Get the accessibility tree of the current page for AI analysis.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async () => bm.snapshot(),
  });

  registry.register({
    category: 'browser',
    definition: {
      name: 'browser_scroll',
      description: 'Scroll the page up or down.',
      input_schema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
          amount: { type: 'number', description: 'Pixels to scroll (default: 500)' },
        },
        required: ['direction'],
      },
    },
    handler: async (input) => bm.scroll(input.direction as 'up' | 'down', input.amount as number),
  });

  registry.register({
    category: 'browser',
    definition: {
      name: 'browser_evaluate',
      description: 'Execute JavaScript in the browser page context.',
      input_schema: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'JavaScript expression to evaluate' } },
        required: ['expression'],
      },
    },
    handler: async (input) => bm.evaluate(input.expression as string),
  });

  registry.register({
    category: 'browser',
    definition: {
      name: 'browser_wait',
      description: 'Wait for an element to appear on the page.',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to wait for' },
          timeout: { type: 'number', description: 'Timeout in ms (default: 10000)' },
        },
        required: ['selector'],
      },
    },
    handler: async (input) => bm.waitFor(input.selector as string, input.timeout as number),
  });

  registry.register({
    category: 'browser',
    definition: {
      name: 'browser_tabs',
      description: 'List all open browser tabs with their URLs and titles.',
      input_schema: { type: 'object', properties: {} },
    },
    handler: async () => JSON.stringify(await bm.listTabs()),
  });
}
