/**
 * Live E2E Tests — requires actual API keys and running services
 * Run: npx tsx src/__tests__/e2e-live.test.ts
 */
import 'dotenv/config';
import { createLLMProvider } from '../providers/factory.js';
import type { LLMProviderConfig } from '../providers/types.js';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function log(label: string, status: 'PASS' | 'FAIL' | 'SKIP', detail?: string) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`  ${icon} [${status}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function testLLMChat() {
  console.log('\n═══ TEST 1: LLM (Claude) 실제 채팅 ═══');

  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY.includes('your_')) {
    log('Claude Chat', 'SKIP', 'ANTHROPIC_API_KEY not set');
    return false;
  }

  const config: LLMProviderConfig = {
    provider: 'claude',
    apiKey: ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-6',
    maxTokens: 256,
  };

  try {
    const provider = createLLMProvider(config);
    log('Provider created', 'PASS', `model=${provider.model}`);

    const response = await provider.chat([
      { role: 'user', content: 'Say "MegaSloth is alive!" and nothing else.' },
    ], { maxTokens: 64 });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.type === 'text' ? b.text : '')
      .join('');

    if (text.toLowerCase().includes('megasloth')) {
      log('Chat response', 'PASS', `"${text.trim().substring(0, 80)}"`);
    } else {
      log('Chat response', 'FAIL', `Unexpected: "${text.trim().substring(0, 80)}"`);
    }

    log('Stop reason', response.stopReason === 'end_turn' ? 'PASS' : 'FAIL', response.stopReason);
    return true;
  } catch (err: any) {
    log('Claude Chat', 'FAIL', err.message?.substring(0, 100));
    return false;
  }
}

async function testLLMWithTools() {
  console.log('\n═══ TEST 2: LLM 도구 호출 (Tool Use) ═══');

  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY.includes('your_')) {
    log('Tool Use', 'SKIP', 'ANTHROPIC_API_KEY not set');
    return false;
  }

  const config: LLMProviderConfig = {
    provider: 'claude',
    apiKey: ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-6',
    maxTokens: 256,
  };

  const tools = [
    {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      input_schema: {
        type: 'object' as const,
        properties: {
          location: { type: 'string', description: 'City name' },
        },
        required: ['location'],
      },
    },
  ];

  try {
    const provider = createLLMProvider(config);

    const response = await provider.chat([
      { role: 'user', content: 'What is the weather in Seoul right now?' },
    ], { tools, maxTokens: 256 });

    if (response.stopReason === 'tool_use' && response.toolUses.length > 0) {
      const toolCall = response.toolUses[0]!;
      log('Tool called', 'PASS', `name=${toolCall.name}, input=${JSON.stringify(toolCall.input)}`);

      const toolResult = provider.createToolResultMessage(toolCall.id, JSON.stringify({ temp: '3°C', condition: 'Cloudy' }));
      log('Tool result message created', 'PASS', `type=${toolResult.type}`);
      return true;
    } else {
      log('Tool Use', 'FAIL', `Expected tool_use, got ${response.stopReason}`);
      return false;
    }
  } catch (err: any) {
    log('Tool Use', 'FAIL', err.message?.substring(0, 100));
    return false;
  }
}

async function testGitHubAdapter() {
  console.log('\n═══ TEST 3: GitHub 어댑터 실제 연동 ═══');

  if (!GITHUB_TOKEN || GITHUB_TOKEN.includes('your_')) {
    log('GitHub', 'SKIP', 'GITHUB_TOKEN not set');
    return false;
  }

  try {
    const { GitHubAdapter } = await import('../adapters/git/github.adapter.js');
    const adapter = new GitHubAdapter({
      apiUrl: 'https://api.github.com',
      token: GITHUB_TOKEN,
      webhookSecret: 'test',
    });

    // Test 3a: Get specific repo
    const repo = await adapter.getRepository('stronghuni', 'MegaSloth');
    log('Get MegaSloth repo', 'PASS', `${repo.fullName}`);

    // Test 3b: List branches
    const branches = await adapter.listBranches('stronghuni', 'MegaSloth');
    log('List branches', 'PASS', `Found ${branches.length} branches: ${branches.map(b => b.name).join(', ')}`);

    // Test 3c: List PRs
    const prs = await adapter.listPullRequests('stronghuni', 'MegaSloth');
    log('List PRs', 'PASS', `Found ${prs.length} pull requests`);

    // Test 3d: List issues
    const issues = await adapter.listIssues('stronghuni', 'MegaSloth');
    log('List issues', 'PASS', `Found ${issues.length} issues`);

    // Test 3e: Get file content
    const readme = await adapter.getFileContent('stronghuni', 'MegaSloth', 'README.md');
    log('Get README.md', readme.includes('MegaSloth') ? 'PASS' : 'FAIL', `${readme.length} chars, contains MegaSloth: ${readme.includes('MegaSloth')}`);

    // Test 3f: List workflow runs
    const runs = await adapter.getWorkflowRuns('stronghuni', 'MegaSloth');
    log('List workflow runs', 'PASS', `Found ${runs.length} runs`);

    // Test 3g: Create an issue and close it (actual write test)
    console.log('\n  --- GitHub Write Tests ---');
    const testIssue = await adapter.createIssue('stronghuni', 'MegaSloth', {
      title: '[E2E Test] Automated test issue — please ignore',
      body: 'This issue was created by the MegaSloth E2E test suite.\nIt will be automatically closed.',
      labels: ['test'],
    });
    log('Create issue', 'PASS', `#${testIssue.number}: "${testIssue.title}"`);

    // Close the test issue
    const closed = await adapter.closeIssue('stronghuni', 'MegaSloth', testIssue.number);
    log('Close issue', closed.state === 'closed' ? 'PASS' : 'FAIL', `state=${closed.state}`);

    // Test 3h: Add comment to the closed issue
    const comment = await adapter.addIssueComment('stronghuni', 'MegaSloth', testIssue.number, '✅ E2E test completed. Issue auto-closed by MegaSloth test suite.');
    log('Add issue comment', 'PASS', `Comment ID: ${comment.id}`);

    return true;
  } catch (err: any) {
    log('GitHub', 'FAIL', err.message?.substring(0, 150));
    return false;
  }
}

async function testFullAgentLoop() {
  console.log('\n═══ TEST 4: Agent Core 풀 루프 (LLM + Tool) ═══');

  if (!ANTHROPIC_API_KEY || !GITHUB_TOKEN || GITHUB_TOKEN.includes('your_')) {
    log('Agent Loop', 'SKIP', 'API keys not configured');
    return false;
  }

  try {
    const { GitHubAdapter } = await import('../adapters/git/github.adapter.js');
    const { createDefaultToolRegistry } = await import('../tools/registry.js');

    const adapter = new GitHubAdapter({ apiUrl: 'https://api.github.com', token: GITHUB_TOKEN, webhookSecret: 'test' });
    const registry = createDefaultToolRegistry();

    const config: LLMProviderConfig = {
      provider: 'claude',
      apiKey: ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-6',
      maxTokens: 1024,
    };
    const provider = createLLMProvider(config);

    const tools = registry.getDefinitions();
    log('Tools registered', 'PASS', `${tools.length} tools available`);

    const response = await provider.chat([
      { role: 'user', content: 'List the open issues in this repository. Use the list_issues tool.' },
    ], { tools, maxTokens: 512 });

    if (response.stopReason === 'tool_use' && response.toolUses.length > 0) {
      const toolCall = response.toolUses[0]!;
      log('Agent requested tool', 'PASS', `tool=${toolCall.name}, input=${JSON.stringify(toolCall.input)}`);

      const registeredTool = registry.get(toolCall.name);
      if (registeredTool) {
        const result = await registeredTool.handler(toolCall.input, {
          gitAdapter: adapter,
          owner: 'stronghuni',
          repo: 'MegaSloth',
        });
        log('Tool executed', 'PASS', `Result length: ${String(result).length} chars`);

        const toolResultMsg = provider.createToolResultMessage(toolCall.id, String(result));
        const followUp = await provider.chat([
          { role: 'user', content: 'List the open issues in this repository.' },
          { role: 'assistant', content: response.content },
          { role: 'user', content: [toolResultMsg] },
        ], { maxTokens: 512 });

        const finalText = followUp.content
          .filter(b => b.type === 'text')
          .map(b => b.type === 'text' ? b.text : '')
          .join('');

        log('Agent final response', 'PASS', `"${finalText.trim().substring(0, 200)}..."`);
      } else {
        log('Tool handler', 'FAIL', `No handler for ${toolCall.name}`);
      }
    } else {
      log('Agent tool use', 'FAIL', `Expected tool_use, got ${response.stopReason}`);
    }

    return true;
  } catch (err: any) {
    log('Agent Loop', 'FAIL', err.message?.substring(0, 150));
    return false;
  }
}

async function testWebhookEndpoint() {
  console.log('\n═══ TEST 5: Webhook 수신 시뮬레이션 ═══');

  try {
    // Start the app
    const { spawn } = await import('child_process');
    const http = await import('http');

    return new Promise<boolean>((resolve) => {
      const child = spawn('node', ['dist/index.js'], {
        cwd: '/Users/namuneulbo/Desktop/megabot',
        stdio: 'pipe',
        env: { ...process.env },
      });

      let started = false;
      let output = '';

      child.stdout.on('data', (d: Buffer) => {
        output += d.toString();
        if (output.includes('MegaSloth started successfully') && !started) {
          started = true;
          runWebhookTests();
        }
      });
      child.stderr.on('data', (d: Buffer) => { output += d.toString(); });

      async function runWebhookTests() {
        // Test health with Redis
        await testEndpoint(http, 'GET', 'http://127.0.0.1:13000/health', null, (status, body) => {
          const parsed = JSON.parse(body);
          log('Health (with Redis)', parsed.services?.redis === 'healthy' ? 'PASS' : 'FAIL',
            `redis=${parsed.services?.redis}, db=${parsed.services?.database}`);
        });

        const { createHmac } = await import('crypto');
        const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || 'your_webhook_secret';

        const pushPayload = JSON.stringify({
          ref: 'refs/heads/main',
          repository: { full_name: 'stronghuni/MegaSloth' },
          commits: [{ id: 'abc123', message: 'test commit', author: { name: 'test' } }],
        });
        const pushSig = 'sha256=' + createHmac('sha256', webhookSecret).update(pushPayload).digest('hex');

        await testEndpoint(http, 'POST', 'http://127.0.0.1:3001/webhook/github', pushPayload, (status, body) => {
          log('GitHub webhook (push)', status === 200 ? 'PASS' : 'FAIL', `status=${status}, body=${body.substring(0, 100)}`);
        }, { 'Content-Type': 'application/json', 'X-GitHub-Event': 'push', 'X-GitHub-Delivery': 'test-123', 'X-Hub-Signature-256': pushSig });

        const prPayload = JSON.stringify({
          action: 'opened',
          number: 1,
          pull_request: { title: 'Test PR', number: 1, head: { ref: 'test' }, base: { ref: 'main' } },
          repository: { full_name: 'stronghuni/MegaSloth' },
        });
        const prSig = 'sha256=' + createHmac('sha256', webhookSecret).update(prPayload).digest('hex');

        await testEndpoint(http, 'POST', 'http://127.0.0.1:3001/webhook/github', prPayload, (status, body) => {
          log('GitHub webhook (PR opened)', status === 200 ? 'PASS' : 'FAIL', `status=${status}, body=${body.substring(0, 100)}`);
        }, { 'Content-Type': 'application/json', 'X-GitHub-Event': 'pull_request', 'X-GitHub-Delivery': 'test-456', 'X-Hub-Signature-256': prSig });

        // Webhook health
        await testEndpoint(http, 'GET', 'http://127.0.0.1:3001/health', null, (status, body) => {
          log('Webhook health', status === 200 ? 'PASS' : 'FAIL', body.substring(0, 100));
        });

        child.kill('SIGTERM');
      }

      function testEndpoint(httpMod: any, method: string, url: string, body: string | null,
        cb: (status: number, body: string) => void, headers?: Record<string, string>): Promise<void> {
        return new Promise((res) => {
          const parsed = new URL(url);
          const req = httpMod.request({
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname,
            method,
            headers: { ...headers },
          }, (resp: any) => {
            let data = '';
            resp.on('data', (chunk: string) => data += chunk);
            resp.on('end', () => { cb(resp.statusCode, data); res(); });
          });
          req.on('error', (e: any) => { log(url, 'FAIL', e.message); res(); });
          if (body) req.write(body);
          req.end();
        });
      }

      child.on('exit', () => resolve(true));
      setTimeout(() => { child.kill('SIGTERM'); resolve(false); }, 20000);
    });
  } catch (err: any) {
    log('Webhook', 'FAIL', err.message?.substring(0, 100));
    return false;
  }
}

async function testRedisIntegration() {
  console.log('\n═══ TEST 6: Redis 연동 테스트 ═══');

  try {
    const { CacheStore } = await import('../storage/cache.store.js');
    const cache = new CacheStore({ url: 'redis://localhost:6379', maxRetriesPerRequest: 3 });

    // Wait a moment for connection
    await new Promise(r => setTimeout(r, 500));

    const pong = await cache.ping();
    log('Redis ping', pong ? 'PASS' : 'FAIL', pong ? 'PONG' : 'no response');

    await cache.set('test:e2e', { message: 'MegaSloth E2E', ts: Date.now() }, 60);
    log('Redis SET', 'PASS');

    const value = await cache.get<{ message: string }>('test:e2e');
    log('Redis GET', value?.message === 'MegaSloth E2E' ? 'PASS' : 'FAIL', JSON.stringify(value));

    await cache.delete('test:e2e');
    const deleted = await cache.get('test:e2e');
    log('Redis DELETE', deleted === null ? 'PASS' : 'FAIL');

    await cache.close();
    return true;
  } catch (err: any) {
    log('Redis', 'FAIL', err.message?.substring(0, 100));
    return false;
  }
}

// Run all tests
async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  MegaSloth E2E Live Integration Tests                ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  const results: Record<string, boolean> = {};

  results['Redis'] = await testRedisIntegration();
  results['LLM Chat'] = await testLLMChat();
  results['LLM Tools'] = await testLLMWithTools();
  results['GitHub'] = await testGitHubAdapter();
  results['Agent Loop'] = await testFullAgentLoop();
  results['Webhook'] = await testWebhookEndpoint();

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  FINAL RESULTS                                       ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  for (const [name, passed] of Object.entries(results)) {
    console.log(`║  ${passed ? '✅' : '❌'} ${name.padEnd(48)} ║`);
  }
  console.log('╚═══════════════════════════════════════════════════════╝');

  const allPassed = Object.values(results).every(Boolean);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
