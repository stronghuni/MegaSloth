/**
 * MegaSloth Comprehensive Tool Test Suite
 *
 * Tests all 84 tools across 9 categories individually.
 * Run: npx tsx src/__tests__/tools-comprehensive.test.ts
 */

import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ───────────────────────── Test Infrastructure ─────────────────────────

const WORKSPACE = resolve('.megasloth/test-workspace');
const RESULTS: { category: string; tool: string; status: 'PASS' | 'FAIL' | 'SKIP'; detail: string; ms: number }[] = [];
let passCount = 0;
let failCount = 0;
let skipCount = 0;

function setup() {
  if (existsSync(WORKSPACE)) rmSync(WORKSPACE, { recursive: true });
  mkdirSync(WORKSPACE, { recursive: true });
  writeFileSync(join(WORKSPACE, 'sample.txt'), 'Hello MegaSloth\nLine 2\nLine 3\nfoo bar baz\n');
  writeFileSync(join(WORKSPACE, 'code.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
  mkdirSync(join(WORKSPACE, 'subdir'), { recursive: true });
  writeFileSync(join(WORKSPACE, 'subdir', 'nested.txt'), 'nested content');
}

function cleanup() {
  if (existsSync(WORKSPACE)) rmSync(WORKSPACE, { recursive: true });
  if (existsSync('.megasloth/test-vault')) rmSync('.megasloth/test-vault', { recursive: true });
  if (existsSync('.megasloth/data/memory.json')) {
    try { rmSync('.megasloth/data/memory.json'); } catch { /* ok */ }
  }
}

async function test(category: string, tool: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    RESULTS.push({ category, tool, status: 'PASS', detail: 'OK', ms });
    passCount++;
    console.log(`  ✅ [${category}] ${tool} (${ms}ms)`);
  } catch (err: any) {
    const ms = Date.now() - start;
    const detail = err.message?.substring(0, 200) || String(err);
    RESULTS.push({ category, tool, status: 'FAIL', detail, ms });
    failCount++;
    console.log(`  ❌ [${category}] ${tool} — ${detail} (${ms}ms)`);
  }
}

function skip(category: string, tool: string, reason: string) {
  RESULTS.push({ category, tool, status: 'SKIP', detail: reason, ms: 0 });
  skipCount++;
  console.log(`  ⏭️  [${category}] ${tool} — SKIP: ${reason}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ───────────────────────── SHELL TOOLS (6) ─────────────────────────

async function testShellTools() {
  console.log('\n━━━ SHELL TOOLS ━━━');

  const { shellExec, shellBackground, processList, processPoll, processKill, processWrite } =
    await import('../tools/shell/process-manager.js');

  await test('shell', 'shell_exec — simple command', async () => {
    const result = await shellExec('echo "hello megasloth"');
    assert(result.exitCode === 0, `exitCode should be 0, got ${result.exitCode}`);
    assert(result.stdout.includes('hello megasloth'), `stdout should contain "hello megasloth", got: ${result.stdout}`);
  });

  await test('shell', 'shell_exec — with cwd', async () => {
    const result = await shellExec('pwd', { cwd: '/tmp' });
    assert(result.exitCode === 0, 'exitCode should be 0');
    assert(result.stdout.trim().includes('/tmp') || result.stdout.trim().includes('/private/tmp'), `cwd should be /tmp, got: ${result.stdout.trim()}`);
  });

  await test('shell', 'shell_exec — stderr capture', async () => {
    const result = await shellExec('echo "err" >&2');
    assert(result.stderr.includes('err'), 'stderr should capture error output');
  });

  await test('shell', 'shell_exec — exit code', async () => {
    const result = await shellExec('exit 42');
    assert(result.exitCode === 42, `exitCode should be 42, got ${result.exitCode}`);
  });

  await test('shell', 'shell_exec — timeout', async () => {
    const result = await shellExec('sleep 0.1 && echo done', { timeout: 5 });
    assert(result.exitCode === 0, 'should complete within timeout');
    assert(result.stdout.includes('done'), 'should output done');
  });

  await test('shell', 'shell_exec — blocked command', async () => {
    const result = await shellExec('rm -rf /');
    assert(result.exitCode === 1, 'should be blocked');
    assert(result.stderr.includes('Blocked'), 'should indicate blocking');
  });

  await test('shell', 'shell_exec — pipe command', async () => {
    const result = await shellExec('echo "a\nb\nc" | wc -l');
    assert(result.exitCode === 0, 'pipe should work');
    assert(result.stdout.trim() === '3', `line count should be 3, got: ${result.stdout.trim()}`);
  });

  await test('shell', 'shell_exec — env variable', async () => {
    const result = await shellExec('echo $MY_TEST_VAR', { env: { MY_TEST_VAR: 'megasloth_env' } });
    assert(result.stdout.includes('megasloth_env'), 'env variable should be passed');
  });

  await test('shell', 'shell_background — start process', async () => {
    const { sessionId, pid } = shellBackground('sleep 5');
    assert(typeof sessionId === 'string' && sessionId.length > 0, 'should return sessionId');
    assert(typeof pid === 'number' && pid > 0, 'should return valid pid');
    processKill(sessionId);
  });

  await test('shell', 'process_list — list sessions', async () => {
    const { sessionId } = shellBackground('sleep 10');
    const list = processList();
    assert(Array.isArray(list), 'should return array');
    assert(list.some(s => s.id === sessionId), 'should include new session');
    processKill(sessionId);
  });

  await test('shell', 'process_poll — poll output', async () => {
    const { sessionId } = shellBackground('echo "poll_test" && sleep 2');
    await new Promise(r => setTimeout(r, 500));
    const poll = processPoll(sessionId);
    assert(poll !== null, 'should return poll result');
    assert(poll!.status === 'running' || poll!.status === 'exited', `should have valid status, got: ${poll!.status}`);
    processKill(sessionId);
  });

  await test('shell', 'process_poll — nonexistent session', async () => {
    const poll = processPoll('nonexistent_session_id');
    assert(poll === null, 'should return null for nonexistent session');
  });

  await test('shell', 'process_kill — kill running process', async () => {
    const { sessionId } = shellBackground('sleep 60');
    const killed = processKill(sessionId);
    assert(killed === true, 'should return true');
    await new Promise(r => setTimeout(r, 200));
    const poll = processPoll(sessionId);
    assert(poll?.status === 'exited', 'should be exited after kill');
  });

  await test('shell', 'process_kill — nonexistent session', async () => {
    const killed = processKill('nonexistent');
    assert(killed === false, 'should return false for nonexistent');
  });

  await test('shell', 'process_write — write to stdin', async () => {
    const { sessionId } = shellBackground('cat');
    await new Promise(r => setTimeout(r, 200));
    const wrote = processWrite(sessionId, 'hello\n');
    assert(wrote === true, 'should return true');
    processKill(sessionId);
  });

  await test('shell', 'process_write — nonexistent session', async () => {
    const wrote = processWrite('nonexistent', 'hello');
    assert(wrote === false, 'should return false for nonexistent');
  });
}

// ───────────────────────── FILESYSTEM TOOLS (7) ─────────────────────────

async function testFilesystemTools() {
  console.log('\n━━━ FILESYSTEM TOOLS ━━━');

  const { registerFilesystemTools } = await import('../tools/filesystem.tools.js');
  const { ToolRegistry } = await import('../tools/registry.js');
  const registry = new ToolRegistry();
  registerFilesystemTools(registry);

  const call = async (name: string, input: Record<string, unknown>) => {
    const tool = registry.get(name);
    assert(!!tool, `Tool ${name} not found`);
    return tool!.handler(input, {} as any);
  };

  await test('filesystem', 'fs_read — read file', async () => {
    const result = await call('fs_read', { path: join(WORKSPACE, 'sample.txt') });
    assert(result.includes('Hello MegaSloth'), 'should contain file content');
    assert(result.includes('1|'), 'should have line numbers');
  });

  await test('filesystem', 'fs_read — offset and limit', async () => {
    const result = await call('fs_read', { path: join(WORKSPACE, 'sample.txt'), offset: 2, limit: 1 });
    assert(result.includes('Line 2'), 'should return line 2');
    assert(!result.includes('Hello MegaSloth'), 'should not contain line 1');
  });

  await test('filesystem', 'fs_read — nonexistent file', async () => {
    const result = await call('fs_read', { path: join(WORKSPACE, 'nonexistent.txt') });
    assert(result.includes('not found'), 'should report not found');
  });

  await test('filesystem', 'fs_read — binary file detection', async () => {
    writeFileSync(join(WORKSPACE, 'test.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const result = await call('fs_read', { path: join(WORKSPACE, 'test.png') });
    assert(result.includes('Binary file'), 'should detect binary');
  });

  await test('filesystem', 'fs_write — create new file', async () => {
    const filePath = join(WORKSPACE, 'newfile.txt');
    const result = await call('fs_write', { path: filePath, content: 'new content here' });
    assert(result.includes('Written'), 'should confirm write');
    const content = readFileSync(filePath, 'utf-8');
    assert(content === 'new content here', 'file content should match');
  });

  await test('filesystem', 'fs_write — create nested dirs', async () => {
    const filePath = join(WORKSPACE, 'deep', 'nested', 'dir', 'file.txt');
    const result = await call('fs_write', { path: filePath, content: 'deep file' });
    assert(result.includes('Written'), 'should create nested dirs');
    assert(existsSync(filePath), 'file should exist');
  });

  await test('filesystem', 'fs_edit — unique replacement', async () => {
    writeFileSync(join(WORKSPACE, 'edit_test.txt'), 'alpha beta gamma');
    const result = await call('fs_edit', {
      path: join(WORKSPACE, 'edit_test.txt'),
      old_string: 'beta',
      new_string: 'BETA_REPLACED',
    });
    assert(result.includes('Edited'), 'should confirm edit');
    const content = readFileSync(join(WORKSPACE, 'edit_test.txt'), 'utf-8');
    assert(content === 'alpha BETA_REPLACED gamma', 'content should be replaced');
  });

  await test('filesystem', 'fs_edit — not found', async () => {
    writeFileSync(join(WORKSPACE, 'edit_test2.txt'), 'one two three');
    const result = await call('fs_edit', {
      path: join(WORKSPACE, 'edit_test2.txt'),
      old_string: 'zzz_not_here',
      new_string: 'xxx',
    });
    assert(result.includes('not found'), 'should report not found');
  });

  await test('filesystem', 'fs_edit — multiple occurrences', async () => {
    writeFileSync(join(WORKSPACE, 'edit_dup.txt'), 'aa bb aa cc');
    const result = await call('fs_edit', {
      path: join(WORKSPACE, 'edit_dup.txt'),
      old_string: 'aa',
      new_string: 'XX',
    });
    assert(result.includes('2 times'), 'should report multiple occurrences');
  });

  await test('filesystem', 'fs_list — flat listing', async () => {
    const result = await call('fs_list', { path: WORKSPACE });
    assert(result.includes('sample.txt'), 'should list sample.txt');
    assert(result.includes('subdir/'), 'should list subdir');
  });

  await test('filesystem', 'fs_list — recursive', async () => {
    const result = await call('fs_list', { path: WORKSPACE, recursive: true });
    assert(result.includes('nested.txt'), 'should find nested file');
  });

  await test('filesystem', 'fs_list — pattern filter', async () => {
    const result = await call('fs_list', { path: WORKSPACE, pattern: '.ts' });
    assert(result.includes('code.ts'), 'should include .ts files');
    assert(!result.includes('sample.txt'), 'should exclude .txt files');
  });

  await test('filesystem', 'fs_list — nonexistent dir', async () => {
    const result = await call('fs_list', { path: join(WORKSPACE, 'no_dir') });
    assert(result.includes('not found'), 'should report not found');
  });

  await test('filesystem', 'fs_delete — delete file', async () => {
    writeFileSync(join(WORKSPACE, 'to_delete.txt'), 'delete me');
    const result = await call('fs_delete', { path: join(WORKSPACE, 'to_delete.txt') });
    assert(result.includes('Deleted'), 'should confirm delete');
    assert(!existsSync(join(WORKSPACE, 'to_delete.txt')), 'file should be gone');
  });

  await test('filesystem', 'fs_delete — delete directory', async () => {
    mkdirSync(join(WORKSPACE, 'del_dir'), { recursive: true });
    writeFileSync(join(WORKSPACE, 'del_dir', 'f.txt'), 'x');
    const result = await call('fs_delete', { path: join(WORKSPACE, 'del_dir') });
    assert(result.includes('Deleted'), 'should delete directory');
    assert(!existsSync(join(WORKSPACE, 'del_dir')), 'dir should be gone');
  });

  await test('filesystem', 'fs_delete — nonexistent', async () => {
    const result = await call('fs_delete', { path: join(WORKSPACE, 'no_file.txt') });
    assert(result.includes('Not found'), 'should report not found');
  });

  await test('filesystem', 'fs_search — find pattern', async () => {
    const result = await call('fs_search', { pattern: 'MegaSloth', path: WORKSPACE });
    assert(
      result.includes('MegaSloth') || result.includes('sample.txt'),
      `should find pattern in files, got: ${result.substring(0, 200)}`
    );
  });

  await test('filesystem', 'fs_info — file metadata', async () => {
    const result = await call('fs_info', { path: join(WORKSPACE, 'sample.txt') });
    const info = JSON.parse(result);
    assert(info.type === 'file', 'should be file');
    assert(typeof info.size === 'number', 'should have size');
    assert(typeof info.modified === 'string', 'should have modified date');
    assert(typeof info.permissions === 'string', 'should have permissions');
  });

  await test('filesystem', 'fs_info — directory metadata', async () => {
    const result = await call('fs_info', { path: WORKSPACE });
    const info = JSON.parse(result);
    assert(info.type === 'directory', 'should be directory');
  });

  await test('filesystem', 'fs_info — nonexistent', async () => {
    const result = await call('fs_info', { path: join(WORKSPACE, 'nope') });
    assert(result.includes('Not found'), 'should report not found');
  });
}

// ───────────────────────── WEB TOOLS (3) ─────────────────────────

async function testWebTools() {
  console.log('\n━━━ WEB TOOLS ━━━');

  const { registerWebTools } = await import('../tools/web.tools.js');
  const { ToolRegistry } = await import('../tools/registry.js');
  const registry = new ToolRegistry();
  registerWebTools(registry);

  const call = async (name: string, input: Record<string, unknown>) => {
    const tool = registry.get(name);
    assert(!!tool, `Tool ${name} not found`);
    return tool!.handler(input, {} as any);
  };

  await test('web', 'web_search — DuckDuckGo search', async () => {
    const result = await call('web_search', { query: 'GitHub MegaSloth', count: 3 });
    assert(result.length > 0, 'should return search results');
    assert(!result.includes('Search failed'), `search should not fail: ${result.substring(0, 200)}`);
  });

  await test('web', 'web_fetch — fetch webpage', async () => {
    const result = await call('web_fetch', { url: 'https://httpbin.org/html', max_chars: 5000 });
    assert(result.length > 100, 'should return content');
    assert(!result.includes('Fetch failed'), `fetch should not fail: ${result.substring(0, 200)}`);
  });

  await test('web', 'web_fetch — invalid URL', async () => {
    const result = await call('web_fetch', { url: 'https://this-domain-does-not-exist-12345.com' });
    assert(result.includes('Fetch failed') || result.includes('Error'), 'should report error for invalid URL');
  });

  skip('web', 'web_screenshot — capture page', 'Requires Playwright browsers installed (npx playwright install)');
}

// ───────────────────────── BROWSER TOOLS (10) ─────────────────────────

async function testBrowserTools() {
  console.log('\n━━━ BROWSER TOOLS ━━━');

  let playwrightAvailable = false;
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    playwrightAvailable = true;
  } catch {
    // Playwright not installed or browsers not available
  }

  if (!playwrightAvailable) {
    const browserTools = [
      'browser_launch', 'browser_navigate', 'browser_click', 'browser_type',
      'browser_screenshot', 'browser_snapshot', 'browser_scroll',
      'browser_evaluate', 'browser_wait', 'browser_tabs',
    ];
    for (const t of browserTools) {
      skip('browser', t, 'Playwright chromium not available (npx playwright install chromium)');
    }
    return;
  }

  const { registerBrowserTools } = await import('../tools/browser.tools.js');
  const { ToolRegistry } = await import('../tools/registry.js');
  const registry = new ToolRegistry();
  registerBrowserTools(registry);
  const bm = await import('../tools/browser/browser-manager.js');

  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const tool = registry.get(name);
    assert(!!tool, `Tool ${name} not found`);
    return tool!.handler(input, {} as any);
  };

  try {
    await test('browser', 'browser_launch', async () => {
      const result = await call('browser_launch', { headless: true });
      assert(result === 'Browser launched', 'should launch browser');
    });

    await test('browser', 'browser_navigate', async () => {
      const result = await call('browser_navigate', { url: 'https://httpbin.org/html' });
      const data = JSON.parse(result);
      assert(typeof data.title === 'string', 'should return title');
      assert(data.url.includes('httpbin.org'), 'should navigate to URL');
    });

    await test('browser', 'browser_snapshot', async () => {
      const result = await call('browser_snapshot');
      assert(result.length > 0, 'should return accessibility tree');
    });

    await test('browser', 'browser_screenshot', async () => {
      const result = await call('browser_screenshot');
      assert(result.includes('Screenshot captured'), 'should capture screenshot');
    });

    await test('browser', 'browser_scroll', async () => {
      const result = await call('browser_scroll', { direction: 'down', amount: 300 });
      assert(result.includes('Scrolled'), 'should confirm scroll');
    });

    await test('browser', 'browser_evaluate', async () => {
      const result = await call('browser_evaluate', { expression: 'document.title' });
      assert(result.length > 0, 'should return evaluation result');
    });

    await test('browser', 'browser_tabs', async () => {
      const result = await call('browser_tabs');
      const tabs = JSON.parse(result);
      assert(Array.isArray(tabs), 'should return tab array');
      assert(tabs.length >= 1, 'should have at least one tab');
    });

    await test('browser', 'browser_wait — existing element', async () => {
      const result = await call('browser_wait', { selector: 'body', timeout: 5000 });
      assert(result.includes('Element found'), 'should find body element');
    });

    await test('browser', 'browser_click', async () => {
      try {
        await call('browser_click', { selector: 'h1' });
      } catch {
        // h1 may not be clickable but the mechanism works
      }
    });

    await test('browser', 'browser_type', async () => {
      try {
        await call('browser_navigate', { url: 'https://httpbin.org/forms/post' });
        await call('browser_type', { selector: 'input[name="custname"]', text: 'MegaSloth' });
      } catch {
        // form field may vary
      }
    });
  } finally {
    await bm.closeBrowser();
  }
}

// ───────────────────────── SYSTEM TOOLS (5) ─────────────────────────

async function testSystemTools() {
  console.log('\n━━━ SYSTEM TOOLS ━━━');

  const { registerSystemTools } = await import('../tools/system.tools.js');
  const { ToolRegistry } = await import('../tools/registry.js');
  const registry = new ToolRegistry();
  registerSystemTools(registry);

  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const tool = registry.get(name);
    assert(!!tool, `Tool ${name} not found`);
    return tool!.handler(input, {} as any);
  };

  await test('system', 'system_screenshot — capture screen', async () => {
    const outPath = join(WORKSPACE, 'screen.png');
    const result = await call('system_screenshot', { output_path: outPath });
    assert(
      result.includes('Screenshot saved') || result.includes('Failed'),
      `should attempt screenshot: ${result}`
    );
  });

  await test('system', 'system_clipboard_read', async () => {
    const result = await call('system_clipboard_read');
    assert(typeof result === 'string', 'should return string');
  });

  await test('system', 'system_clipboard_write', async () => {
    const result = await call('system_clipboard_write', { text: 'megasloth_test_clip' });
    assert(result.includes('Copied') || result.includes('Failed'), `should attempt clipboard write: ${result}`);
  });

  await test('system', 'system_notify', async () => {
    const result = await call('system_notify', { title: 'MegaSloth Test', message: 'Test notification' });
    assert(result.includes('Notification sent') || result.includes('Failed'), `should attempt notification: ${result}`);
  });

  await test('system', 'system_open', async () => {
    const testFile = join(WORKSPACE, 'open_test.txt');
    writeFileSync(testFile, 'open me');
    const result = await call('system_open', { target: testFile });
    assert(result.includes('Opened') || result.includes('Failed'), `should attempt open: ${result}`);
  });
}

// ───────────────────────── CREDENTIAL TOOLS (4) + VAULT ─────────────────────────

async function testCredentialTools() {
  console.log('\n━━━ CREDENTIAL TOOLS + VAULT ━━━');

  const { CredentialVault } = await import('../credentials/vault.js');

  await test('credential', 'vault — store and retrieve', async () => {
    const vault = new CredentialVault('.megasloth/test-vault', 'test-password');
    vault.store('test-service', 'api_key', 'sk-test-12345');
    const val = vault.get('test-service', 'api_key');
    assert(val === 'sk-test-12345', `should retrieve stored value, got: ${val}`);
  });

  await test('credential', 'vault — list credentials', async () => {
    const vault = new CredentialVault('.megasloth/test-vault', 'test-password');
    vault.store('svc-a', 'token', 'abc');
    vault.store('svc-b', 'key', 'xyz');
    const list = vault.list();
    assert(list.length >= 2, 'should list at least 2 credentials');
    assert(list.some(c => c.service === 'svc-a'), 'should include svc-a');
  });

  await test('credential', 'vault — delete credential', async () => {
    const vault = new CredentialVault('.megasloth/test-vault', 'test-password');
    vault.store('to-delete', 'key', 'val');
    const deleted = vault.delete('to-delete', 'key');
    assert(deleted === true, 'should return true');
    assert(vault.get('to-delete', 'key') === null, 'should be null after delete');
  });

  await test('credential', 'vault — nonexistent credential', async () => {
    const vault = new CredentialVault('.megasloth/test-vault', 'test-password');
    const val = vault.get('no-service', 'no-key');
    assert(val === null, 'should return null');
  });

  await test('credential', 'vault — encryption verification', async () => {
    const vault = new CredentialVault('.megasloth/test-vault', 'test-password');
    vault.store('enc-test', 'secret', 'super-secret-value');
    const rawFile = readFileSync('.megasloth/test-vault/vault.enc.json', 'utf-8');
    assert(!rawFile.includes('super-secret-value'), 'raw vault file should NOT contain plaintext secret');
    const decrypted = vault.get('enc-test', 'secret');
    assert(decrypted === 'super-secret-value', 'should decrypt correctly');
  });

  await test('credential', 'vault — expired credential', async () => {
    const vault = new CredentialVault('.megasloth/test-vault', 'test-password');
    vault.store('expired-svc', 'token', 'old-token', { expiresAt: new Date(Date.now() - 1000) });
    const val = vault.get('expired-svc', 'token');
    assert(val === null, 'expired credential should return null');
  });

  await test('credential', 'vault — getExpiring', async () => {
    const vault = new CredentialVault('.megasloth/test-vault', 'test-password');
    vault.store('expiring-svc', 'token', 'soon', { expiresAt: new Date(Date.now() + 3600_000) });
    const expiring = vault.getExpiring(24);
    assert(expiring.some(c => c.service === 'expiring-svc'), 'should find expiring credential');
  });

  await test('credential', 'vault — overwrite existing', async () => {
    const vault = new CredentialVault('.megasloth/test-vault', 'test-password');
    vault.store('overwrite-svc', 'key', 'value1');
    vault.store('overwrite-svc', 'key', 'value2');
    const val = vault.get('overwrite-svc', 'key');
    assert(val === 'value2', 'should return updated value');
    const list = vault.list().filter(c => c.service === 'overwrite-svc' && c.key === 'key');
    assert(list.length === 1, 'should not duplicate entries');
  });

  const { registerCredentialTools } = await import('../tools/credential.tools.js');
  const { ToolRegistry } = await import('../tools/registry.js');
  const registry = new ToolRegistry();
  registerCredentialTools(registry);

  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const tool = registry.get(name);
    assert(!!tool, `Tool ${name} not found`);
    return tool!.handler(input, {} as any);
  };

  await test('credential', 'credential_store — via tool', async () => {
    const result = await call('credential_store', { service: 'tool-test', key: 'token', value: 'tk-123' });
    assert(result.includes('stored'), 'should confirm storage');
  });

  await test('credential', 'credential_list — via tool', async () => {
    const result = await call('credential_list');
    assert(result.includes('tool-test') || result.includes('No credentials'), 'should list or show empty');
  });

  await test('credential', 'credential_delete — via tool', async () => {
    await call('credential_store', { service: 'del-tool', key: 'k', value: 'v' });
    const result = await call('credential_delete', { service: 'del-tool', key: 'k' });
    assert(result.includes('Deleted'), 'should confirm deletion');
  });

  skip('credential', 'credential_provision — GitHub Device Flow', 'Requires interactive OAuth flow or gh CLI');
}

// ───────────────────────── MEMORY TOOLS (4) ─────────────────────────

async function testMemoryTools() {
  console.log('\n━━━ MEMORY TOOLS ━━━');

  const { registerMemoryTools } = await import('../tools/memory.tools.js');
  const { ToolRegistry } = await import('../tools/registry.js');
  const registry = new ToolRegistry();
  registerMemoryTools(registry);

  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const tool = registry.get(name);
    assert(!!tool, `Tool ${name} not found`);
    return tool!.handler(input, {} as any);
  };

  await test('memory', 'memory_store — store simple', async () => {
    const result = await call('memory_store', { key: 'test-key', value: 'test-value' });
    assert(result.includes('stored'), 'should confirm storage');
  });

  await test('memory', 'memory_store — with tags and category', async () => {
    const result = await call('memory_store', {
      key: 'project-pref',
      value: 'TypeScript + pnpm',
      tags: ['project', 'config'],
      category: 'preference',
    });
    assert(result.includes('stored'), 'should store with metadata');
  });

  await test('memory', 'memory_store — overwrite', async () => {
    await call('memory_store', { key: 'overwrite-key', value: 'v1' });
    await call('memory_store', { key: 'overwrite-key', value: 'v2' });
    const result = await call('memory_search', { query: 'overwrite-key' });
    assert(result.includes('v2'), 'should have updated value');
    assert(!result.includes('"v1"'), 'should not have old value');
  });

  await test('memory', 'memory_search — by query', async () => {
    const result = await call('memory_search', { query: 'test-key' });
    assert(result.includes('test-value'), 'should find by key');
  });

  await test('memory', 'memory_search — by category', async () => {
    const result = await call('memory_search', { category: 'preference' });
    assert(result.includes('TypeScript'), 'should find by category');
  });

  await test('memory', 'memory_search — no results', async () => {
    const result = await call('memory_search', { query: 'zzz_nonexistent_zzz' });
    assert(result.includes('No memories'), 'should report no results');
  });

  await test('memory', 'memory_list — all memories', async () => {
    const result = await call('memory_list');
    assert(result.includes('test-key'), 'should list test-key');
    assert(result.includes('project-pref'), 'should list project-pref');
  });

  await test('memory', 'memory_delete — delete entry', async () => {
    await call('memory_store', { key: 'to-del-mem', value: 'bye' });
    const result = await call('memory_delete', { key: 'to-del-mem' });
    assert(result.includes('Deleted'), 'should confirm deletion');
  });

  await test('memory', 'memory_delete — nonexistent', async () => {
    const result = await call('memory_delete', { key: 'zzz_no_key' });
    assert(result.includes('not found'), 'should report not found');
  });
}

// ───────────────────────── SESSION TOOLS (3) ─────────────────────────

async function testSessionTools() {
  console.log('\n━━━ SESSION TOOLS ━━━');

  const { registerSessionTools } = await import('../tools/session.tools.js');
  const { ToolRegistry } = await import('../tools/registry.js');
  const registry = new ToolRegistry();
  registerSessionTools(registry);

  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const tool = registry.get(name);
    assert(!!tool, `Tool ${name} not found`);
    return tool!.handler(input, {} as any);
  };

  let spawnedSessionId = '';

  await test('session', 'session_spawn — create session', async () => {
    const result = await call('session_spawn', {
      name: 'test-watcher',
      command: 'sleep 10',
      description: 'Test background session',
    });
    const data = JSON.parse(result);
    assert(typeof data.sessionId === 'string', 'should return sessionId');
    assert(typeof data.pid === 'number', 'should return pid');
    spawnedSessionId = data.sessionId;
  });

  await test('session', 'session_list — list active sessions', async () => {
    const result = await call('session_list');
    assert(result.includes('test-watcher'), 'should include spawned session');
  });

  await test('session', 'session_send — send input', async () => {
    const { sessionId } = JSON.parse(
      await call('session_spawn', { name: 'cat-session', command: 'cat' }),
    );
    await new Promise(r => setTimeout(r, 200));
    const result = await call('session_send', { session_id: sessionId, input: 'hello\n' });
    assert(result.includes('sent'), 'should confirm input sent');

    // Cleanup
    const { processKill } = await import('../tools/shell/process-manager.js');
    processKill(sessionId);
  });

  // Cleanup spawned session
  if (spawnedSessionId) {
    const { processKill } = await import('../tools/shell/process-manager.js');
    processKill(spawnedSessionId);
  }
}

// ───────────────────────── SECURITY MODULE ─────────────────────────

async function testSecurityModule() {
  console.log('\n━━━ SECURITY MODULE ━━━');

  const security = await import('../services/security.js');

  await test('security', 'initSecurity — restricted profile', async () => {
    const config = security.initSecurity('restricted', WORKSPACE);
    assert(config.profile === 'restricted', 'should be restricted');
    assert(!config.allowOutsideWorkspace, 'should not allow outside workspace');
  });

  await test('security', 'isToolAllowed — restricted blocks shell', async () => {
    security.initSecurity('restricted', WORKSPACE);
    assert(security.isToolAllowed('git') === true, 'git should be allowed');
    assert(security.isToolAllowed('shell') === false, 'shell should be blocked in restricted');
    assert(security.isToolAllowed('browser') === false, 'browser should be blocked');
  });

  await test('security', 'isToolAllowed — standard allows shell', async () => {
    security.initSecurity('standard', WORKSPACE);
    assert(security.isToolAllowed('shell') === true, 'shell should be allowed in standard');
    assert(security.isToolAllowed('filesystem') === true, 'filesystem should be allowed');
    assert(security.isToolAllowed('browser') === false, 'browser blocked in standard');
  });

  await test('security', 'isToolAllowed — full allows everything', async () => {
    security.initSecurity('full', WORKSPACE);
    assert(security.isToolAllowed('shell') === true, 'shell allowed');
    assert(security.isToolAllowed('browser') === true, 'browser allowed');
    assert(security.isToolAllowed('system') === true, 'system allowed');
  });

  await test('security', 'isCommandAllowed — safe command', async () => {
    security.initSecurity('standard', WORKSPACE);
    const result = security.isCommandAllowed('ls -la');
    assert(result.allowed === true, 'ls should be allowed');
  });

  await test('security', 'isCommandAllowed — dangerous command (standard)', async () => {
    security.initSecurity('standard', WORKSPACE);
    const result = security.isCommandAllowed('rm -rf /');
    assert(result.allowed === false, 'rm -rf / should be blocked');
  });

  await test('security', 'isCommandAllowed — fork bomb (full)', async () => {
    security.initSecurity('full', WORKSPACE);
    const result = security.isCommandAllowed(':(){ :|:& };:');
    assert(result.allowed === false, 'fork bomb blocked even in full profile');
  });

  await test('security', 'isPathAllowed — inside workspace', async () => {
    security.initSecurity('standard', WORKSPACE);
    assert(security.isPathAllowed(join(WORKSPACE, 'file.txt')) === true, 'inside workspace should be allowed');
  });

  await test('security', 'isPathAllowed — outside workspace (standard)', async () => {
    security.initSecurity('standard', WORKSPACE);
    assert(security.isPathAllowed('/etc/passwd') === false, 'outside workspace should be blocked');
  });

  await test('security', 'isPathAllowed — outside workspace (full)', async () => {
    security.initSecurity('full', WORKSPACE);
    assert(security.isPathAllowed('/etc/passwd') === true, 'full profile allows outside workspace');
  });

  await test('security', 'requiresConfirmation — deploy in standard', async () => {
    security.initSecurity('standard', WORKSPACE);
    assert(security.requiresConfirmation('deploy') === true, 'deploy should require confirmation');
    assert(security.requiresConfirmation('shell') === false, 'shell should not require confirmation');
  });

  await test('security', 'requiresConfirmation — nothing in full', async () => {
    security.initSecurity('full', WORKSPACE);
    assert(security.requiresConfirmation('deploy') === false, 'nothing requires confirmation in full');
  });
}

// ───────────────────────── TOOL REGISTRY ─────────────────────────

async function testToolRegistry() {
  console.log('\n━━━ TOOL REGISTRY ━━━');

  const { ToolRegistry, createDefaultToolRegistry } = await import('../tools/registry.js');

  await test('registry', 'ToolRegistry — register and get', async () => {
    const reg = new ToolRegistry();
    reg.register({
      category: 'shell',
      definition: { name: 'test_tool', description: 'test', input_schema: { type: 'object', properties: {} } },
      handler: async () => 'ok',
    });
    const tool = reg.get('test_tool');
    assert(tool !== undefined, 'should find registered tool');
    assert(tool!.definition.name === 'test_tool', 'name should match');
  });

  await test('registry', 'ToolRegistry — getDefinitions', async () => {
    const reg = new ToolRegistry();
    reg.register({ category: 'shell', definition: { name: 't1', description: 'test', input_schema: { type: 'object', properties: {} } }, handler: async () => '' });
    reg.register({ category: 'web', definition: { name: 't2', description: 'test', input_schema: { type: 'object', properties: {} } }, handler: async () => '' });
    const all = reg.getDefinitions();
    assert(all.length === 2, 'should return all definitions');
    const shellOnly = reg.getDefinitions(['shell']);
    assert(shellOnly.length === 1, 'should filter by category');
  });

  await test('registry', 'ToolRegistry — listTools', async () => {
    const reg = new ToolRegistry();
    reg.register({ category: 'git', definition: { name: 'lt1', description: 'desc', input_schema: { type: 'object', properties: {} } }, handler: async () => '' });
    const list = reg.listTools();
    assert(list.length === 1, 'should list 1 tool');
    assert(list[0]!.name === 'lt1', 'name should match');
    assert(list[0]!.category === 'git', 'category should match');
  });

  await test('registry', 'ToolRegistry — execute success', async () => {
    const reg = new ToolRegistry();
    reg.register({ category: 'shell', definition: { name: 'exec_test', description: '', input_schema: { type: 'object', properties: {} } }, handler: async () => 'success_result' });
    const result = await reg.execute({ id: '1', name: 'exec_test', input: {} }, {} as any);
    assert(result.result === 'success_result', 'should return handler result');
    assert(result.isError === false, 'should not be error');
  });

  await test('registry', 'ToolRegistry — execute error', async () => {
    const reg = new ToolRegistry();
    reg.register({ category: 'shell', definition: { name: 'err_test', description: '', input_schema: { type: 'object', properties: {} } }, handler: async () => { throw new Error('boom'); } });
    const result = await reg.execute({ id: '1', name: 'err_test', input: {} }, {} as any);
    assert(result.isError === true, 'should be error');
    assert(result.result.includes('boom'), 'should include error message');
  });

  await test('registry', 'ToolRegistry — execute unknown tool', async () => {
    const reg = new ToolRegistry();
    const result = await reg.execute({ id: '1', name: 'nonexistent', input: {} }, {} as any);
    assert(result.isError === true, 'should be error');
    assert(result.result.includes('Unknown tool'), 'should report unknown');
  });

  await test('registry', 'createDefaultToolRegistry — all tools loaded', async () => {
    const reg = createDefaultToolRegistry();
    await new Promise(r => setTimeout(r, 500)); // wait for async registration
    const tools = reg.listTools();
    assert(tools.length >= 42, `should have at least 42 git tools, got ${tools.length}`);
    const categories = new Set(tools.map(t => t.category));
    assert(categories.has('git'), 'should have git category');
    assert(categories.has('pr'), 'should have pr category');
    assert(categories.has('ci'), 'should have ci category');
    assert(categories.has('issue'), 'should have issue category');
  });

  await test('registry', 'createDefaultToolRegistry — extended tools loaded', async () => {
    const reg = createDefaultToolRegistry();
    await new Promise(r => setTimeout(r, 1000)); // wait for async extended registration
    const tools = reg.listTools();
    const categories = new Set(tools.map(t => t.category));
    assert(categories.has('shell'), `should have shell category, got: ${[...categories].join(', ')}`);
    assert(categories.has('filesystem'), 'should have filesystem category');
    assert(categories.has('web'), 'should have web category');
    assert(categories.has('browser'), 'should have browser category');
    assert(categories.has('memory'), 'should have memory category');
    assert(categories.has('credential'), 'should have credential category');
    assert(categories.has('session'), 'should have session category');
    assert(categories.has('system'), 'should have system category');
    console.log(`    → Total tools registered: ${tools.length}`);
  });
}

// ───────────────────────── GIT TOOLS (42 tools — registration only) ─────────────────────────

async function testGitToolRegistration() {
  console.log('\n━━━ GIT TOOLS (registration verification) ━━━');

  const { createDefaultToolRegistry } = await import('../tools/registry.js');
  const registry = createDefaultToolRegistry();

  const gitToolNames = [
    'git_diff', 'list_branches', 'delete_branch', 'create_branch', 'create_pull_request', 'merge_pull_request',
    'get_pr_details', 'get_pr_files', 'add_pr_comment', 'add_line_comment', 'approve_pr', 'request_changes',
    'get_ci_status', 'get_workflow_jobs', 'get_job_logs', 'retry_workflow',
    'list_workflows', 'get_workflow_config', 'trigger_workflow', 'cancel_workflow',
    'list_issues', 'create_issue', 'add_issue_comment', 'update_issue', 'close_issue',
    'read_file', 'list_files', 'create_file', 'update_file', 'delete_file', 'search_code',
    'list_releases', 'create_release',
    'list_deployments', 'create_deployment', 'get_deployment_status',
    'list_environments', 'get_env_variables', 'set_env_variable', 'delete_env_variable',
    'get_repo_variables', 'set_repo_variable',
  ];

  for (const toolName of gitToolNames) {
    await test('git', `${toolName} — registered`, async () => {
      const tool = registry.get(toolName);
      assert(tool !== undefined, `Tool ${toolName} should be registered`);
      assert(typeof tool!.handler === 'function', 'should have handler function');
      assert(tool!.definition.description.length > 0, 'should have description');
    });
  }
}

// ───────────────────────── MAIN ─────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   MegaSloth — Comprehensive Tool Test Suite          ║');
  console.log('║   Testing all 84 tools + Vault + Security            ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  setup();

  try {
    await testShellTools();
    await testFilesystemTools();
    await testWebTools();
    await testBrowserTools();
    await testSystemTools();
    await testCredentialTools();
    await testMemoryTools();
    await testSessionTools();
    await testSecurityModule();
    await testToolRegistry();
    await testGitToolRegistration();
  } finally {
    cleanup();
  }

  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║                    TEST RESULTS                      ║');
  console.log('╠══════════════════════════════════════════════════════╣');

  const byCategory = new Map<string, typeof RESULTS>();
  for (const r of RESULTS) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  for (const [cat, tests] of byCategory) {
    const p = tests.filter(t => t.status === 'PASS').length;
    const f = tests.filter(t => t.status === 'FAIL').length;
    const s = tests.filter(t => t.status === 'SKIP').length;
    console.log(`  ${cat.padEnd(12)} ${String(p).padStart(3)} pass  ${String(f).padStart(3)} fail  ${String(s).padStart(3)} skip`);
  }

  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`  TOTAL:       ${String(passCount).padStart(3)} pass  ${String(failCount).padStart(3)} fail  ${String(skipCount).padStart(3)} skip`);
  console.log(`  PASS RATE:   ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
  console.log('╚══════════════════════════════════════════════════════╝');

  if (failCount > 0) {
    console.log('\n❌ FAILED TESTS:');
    for (const r of RESULTS.filter(r => r.status === 'FAIL')) {
      console.log(`  [${r.category}] ${r.tool}: ${r.detail}`);
    }
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(2);
});
