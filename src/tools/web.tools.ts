import { type ToolRegistry } from './registry.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('web-tools');

async function fetchReadable(url: string, maxChars = 50_000): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MegaSloth/1.0 (AI Agent)' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) return `HTTP ${response.status}: ${response.statusText}`;
  const html = await response.text();

  try {
    const { JSDOM } = await import('jsdom');
    const { Readability } = await import('@mozilla/readability');
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();

    if (article?.textContent) {
      const TurndownService = (await import('turndown')).default;
      const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
      const markdown = td.turndown(article.content || '');
      return `# ${article.title}\n\n${markdown}`.slice(0, maxChars);
    }
  } catch (err) {
    logger.debug({ err }, 'Readability fallback to raw text');
  }

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

async function duckDuckGoSearch(query: string, count = 5): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MegaSloth/1.0 (AI Agent)' },
    signal: AbortSignal.timeout(15_000),
  });

  const html = await response.text();

  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(html);
  const results: { title: string; url: string; snippet: string }[] = [];

  const links = dom.window.document.querySelectorAll('.result__a');
  const snippets = dom.window.document.querySelectorAll('.result__snippet');

  for (let i = 0; i < Math.min(links.length, count); i++) {
    const a = links[i] as Element;
    const snippet = snippets[i] as Element | undefined;
    const href = a.getAttribute('href') || '';
    const parsedUrl = href.startsWith('//duckduckgo.com/l/?')
      ? decodeURIComponent(href.match(/uddg=([^&]+)/)?.[1] || href)
      : href;

    results.push({
      title: a.textContent?.trim() || '',
      url: parsedUrl,
      snippet: snippet?.textContent?.trim() || '',
    });
  }

  if (results.length === 0) return 'No search results found.';
  return results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`).join('\n\n');
}

export function registerWebTools(registry: ToolRegistry): void {
  registry.register({
    category: 'web',
    definition: {
      name: 'web_search',
      description: 'Search the web using DuckDuckGo (free, no API key). Returns titles, URLs, and snippets.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          count: { type: 'number', description: 'Number of results (default: 5, max: 10)' },
        },
        required: ['query'],
      },
    },
    handler: async (input) => {
      try {
        return await duckDuckGoSearch(input.query as string, Math.min(input.count as number || 5, 10));
      } catch (err: any) {
        return `Search failed: ${err.message}`;
      }
    },
  });

  registry.register({
    category: 'web',
    definition: {
      name: 'web_fetch',
      description: 'Fetch a URL and extract readable content as markdown. Strips scripts, styles, and navigation.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
          max_chars: { type: 'number', description: 'Max characters to return (default: 50000)' },
        },
        required: ['url'],
      },
    },
    handler: async (input) => {
      try {
        return await fetchReadable(input.url as string, input.max_chars as number | undefined);
      } catch (err: any) {
        return `Fetch failed: ${err.message}`;
      }
    },
  });

  registry.register({
    category: 'web',
    definition: {
      name: 'web_screenshot',
      description: 'Take a screenshot of a URL using a headless browser. Returns base64-encoded PNG. Requires Playwright.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to screenshot' },
          full_page: { type: 'boolean', description: 'Capture full page (default: false)' },
          width: { type: 'number', description: 'Viewport width (default: 1280)' },
          height: { type: 'number', description: 'Viewport height (default: 720)' },
        },
        required: ['url'],
      },
    },
    handler: async (input) => {
      try {
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({
          viewport: { width: (input.width as number) || 1280, height: (input.height as number) || 720 },
        });
        await page.goto(input.url as string, { waitUntil: 'networkidle', timeout: 30_000 });
        const buffer = await page.screenshot({ fullPage: input.full_page as boolean || false });
        await browser.close();
        return `Screenshot captured (${buffer.length} bytes, base64): data:image/png;base64,${buffer.toString('base64').slice(0, 200)}... [truncated]`;
      } catch (err: any) {
        return `Screenshot failed: ${err.message}. Install Playwright: npx playwright install chromium`;
      }
    },
  });
}
