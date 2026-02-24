import { getLogger } from '../../utils/logger.js';

const logger = getLogger('browser-manager');

let browserInstance: any = null;
let currentPage: any = null;

export async function ensureBrowser(headless = true): Promise<any> {
  if (browserInstance) return browserInstance;

  try {
    const { chromium } = await import('playwright');
    browserInstance = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    logger.info({ headless }, 'Browser launched');
    return browserInstance;
  } catch (err: any) {
    throw new Error(`Failed to launch browser: ${err.message}. Run: npx playwright install chromium`);
  }
}

export async function getOrCreatePage(): Promise<any> {
  const browser = await ensureBrowser();
  if (!currentPage || currentPage.isClosed()) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    currentPage = await context.newPage();
  }
  return currentPage;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    currentPage = null;
    logger.info('Browser closed');
  }
}

export async function navigate(url: string): Promise<{ title: string; url: string }> {
  const page = await getOrCreatePage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  return { title: await page.title(), url: page.url() };
}

export async function click(selector: string): Promise<string> {
  const page = await getOrCreatePage();
  await page.click(selector, { timeout: 10_000 });
  return `Clicked: ${selector}`;
}

export async function type(selector: string, text: string): Promise<string> {
  const page = await getOrCreatePage();
  await page.fill(selector, text, { timeout: 10_000 });
  return `Typed into ${selector}`;
}

export async function screenshot(): Promise<Buffer> {
  const page = await getOrCreatePage();
  return page.screenshot({ type: 'png' });
}

export async function snapshot(): Promise<string> {
  const page = await getOrCreatePage();
  try {
    const tree = await page.accessibility.snapshot();
    return JSON.stringify(tree, null, 2);
  } catch {
    const title = await page.title();
    const url = page.url();
    const text = await page.innerText('body').catch(() => '');
    return JSON.stringify({
      role: 'page',
      name: title,
      url,
      textPreview: text.substring(0, 2000),
    }, null, 2);
  }
}

export async function scroll(direction: 'up' | 'down', amount = 500): Promise<string> {
  const page = await getOrCreatePage();
  await page.mouse.wheel(0, direction === 'down' ? amount : -amount);
  return `Scrolled ${direction} by ${amount}px`;
}

export async function evaluate(expression: string): Promise<string> {
  const page = await getOrCreatePage();
  const result = await page.evaluate(expression);
  return JSON.stringify(result);
}

export async function waitFor(selector: string, timeout = 10_000): Promise<string> {
  const page = await getOrCreatePage();
  await page.waitForSelector(selector, { timeout });
  return `Element found: ${selector}`;
}

export async function listTabs(): Promise<{ index: number; url: string; title: string }[]> {
  const browser = await ensureBrowser();
  const contexts = browser.contexts();
  const tabs: { index: number; url: string; title: string }[] = [];
  let idx = 0;
  for (const ctx of contexts) {
    for (const page of ctx.pages()) {
      tabs.push({ index: idx++, url: page.url(), title: await page.title() });
    }
  }
  return tabs;
}

export async function selectOption(selector: string, value: string): Promise<string> {
  const page = await getOrCreatePage();
  await page.selectOption(selector, value, { timeout: 10_000 });
  return `Selected ${value} in ${selector}`;
}
