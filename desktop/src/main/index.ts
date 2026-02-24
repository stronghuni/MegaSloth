import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { fork, exec, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let coreProcess: ChildProcess | null = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

app.setName('MegaSloth');

// ── App Config (persisted in userData) ──────────────────────────

function getConfigPath(): string {
  return join(app.getPath('userData'), 'megasloth-state.json');
}

function loadAppState(): Record<string, unknown> {
  const p = getConfigPath();
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf-8')); }
  catch { return {}; }
}

function saveAppState(data: Record<string, unknown>) {
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(data, null, 2));
}

function getProjectRoot(): string {
  if (isDev) return join(__dirname, '../../..');

  if (process.env.MEGASLOTH_HOME && existsSync(process.env.MEGASLOTH_HOME)) {
    return process.env.MEGASLOTH_HOME;
  }

  const state = loadAppState();
  if (state.projectRoot && existsSync(state.projectRoot as string)) {
    return state.projectRoot as string;
  }

  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    join(home, '.megasloth-app'),
    join(home, 'Desktop', 'megasloth'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, '.env'))) {
      const s = loadAppState();
      s.projectRoot = dir;
      saveAppState(s);
      return dir;
    }
  }

  return app.getPath('userData');
}

// ── Window ──────────────────────────────────────────────────────

async function isDevServerRunning(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:5173', { signal: AbortSignal.timeout(1500) });
    return res.ok || res.status === 304;
  } catch {
    return false;
  }
}

async function createWindow() {
  const pngPath = join(__dirname, '../../public/icon.png');
  const icnsPath = join(__dirname, '../../public/icon.icns');
  const iconPath = process.platform === 'darwin' && existsSync(icnsPath) ? icnsPath : pngPath;
  const windowIcon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'MegaSloth',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0a0e17',
    icon: windowIcon,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  if (process.platform === 'darwin' && windowIcon) {
    app.dock.setIcon(windowIcon);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev && await isDevServerRunning()) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const builtIndex = join(__dirname, '../renderer/index.html');
    if (existsSync(builtIndex)) {
      mainWindow.loadFile(builtIndex);
    } else {
      mainWindow.loadURL(`data:text/html,<html><body style="background:#0a0e17;color:#94a3b8;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="color:#10b981">MegaSloth</h2><p>Build required. Run: <code style="color:#fff">cd desktop && pnpm build</code></p></div></body></html>`);
    }
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Tray ────────────────────────────────────────────────────────

function createTray() {
  const iconPath = join(__dirname, '../../public/tray-icon.png');
  const icon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('MegaSloth — Rules Every Repos');

  const updateMenu = () => {
    const isRunning = coreProcess !== null;
    const contextMenu = Menu.buildFromTemplate([
      { label: 'MegaSloth', type: 'normal', enabled: false },
      { type: 'separator' },
      { label: 'Open Dashboard', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type: 'separator' },
      { label: isRunning ? 'Stop Agent' : 'Start Agent', click: () => { isRunning ? stopCore() : startCore(); updateMenu(); } },
      { label: `Status: ${isRunning ? 'Running' : 'Stopped'}`, enabled: false },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; stopCore(); app.quit(); } },
    ]);
    tray?.setContextMenu(contextMenu);
  };

  updateMenu();
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });

  return updateMenu;
}

// ── Core Process ────────────────────────────────────────────────

function startCore() {
  if (coreProcess) return;

  const corePath = join(getProjectRoot(), 'dist/index.js');
  if (!existsSync(corePath)) {
    mainWindow?.webContents.send('core-status', { running: false, error: 'Core not built. Run: pnpm build' });
    return;
  }

  coreProcess = fork(corePath, [], {
    cwd: getProjectRoot(),
    env: { ...process.env, ELECTRON_MANAGED: 'true' },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });

  coreProcess.stdout?.on('data', (data: Buffer) => {
    mainWindow?.webContents.send('core-log', data.toString());
  });

  coreProcess.stderr?.on('data', (data: Buffer) => {
    mainWindow?.webContents.send('core-log', data.toString());
  });

  coreProcess.on('exit', (code) => {
    coreProcess = null;
    mainWindow?.webContents.send('core-status', { running: false, exitCode: code });
  });

  mainWindow?.webContents.send('core-status', { running: true });
}

function stopCore() {
  if (!coreProcess) return;
  coreProcess.kill('SIGTERM');
  coreProcess = null;
}

// ── IPC Handlers ────────────────────────────────────────────────

ipcMain.handle('get-core-status', () => ({ running: coreProcess !== null }));
ipcMain.handle('start-core', () => { startCore(); return { running: true }; });
ipcMain.handle('stop-core', () => { stopCore(); return { running: false }; });
ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('fetch-api', async (_, endpoint: string, options?: { method?: string; body?: unknown }) => {
  try {
    const port = process.env.HTTP_PORT || 13000;
    const fetchOptions: RequestInit = {};
    if (options?.method) fetchOptions.method = options.method;
    if (options?.body) {
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify(options.body);
    }
    const res = await fetch(`http://localhost:${port}${endpoint}`, fetchOptions);
    return await res.json();
  } catch { return null; }
});

ipcMain.handle('get-theme', () => {
  const state = loadAppState();
  return (state.theme as string) || 'dark';
});

ipcMain.handle('set-theme', (_, theme: string) => {
  const state = loadAppState();
  state.theme = theme;
  saveAppState(state);
  return true;
});

ipcMain.handle('is-onboarded', () => {
  const state = loadAppState();
  return !!state.onboarded;
});

ipcMain.handle('complete-onboarding', () => {
  const state = loadAppState();
  state.onboarded = true;
  state.onboardedAt = new Date().toISOString();
  saveAppState(state);
  return true;
});

ipcMain.handle('validate-api-key', async (_, { provider, apiKey }: { provider: string; apiKey: string }) => {
  if (!apiKey || apiKey.length < 10) return { valid: false, error: 'API key is too short' };

  try {
    if (provider === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok || res.status === 200) return { valid: true };
      if (res.status === 401) return { valid: false, error: 'Invalid API key' };
      return { valid: false, error: `Anthropic API returned ${res.status}` };
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return { valid: true };
      if (res.status === 401) return { valid: false, error: 'Invalid API key' };
      return { valid: false, error: `OpenAI API returned ${res.status}` };
    }

    if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return { valid: true };
      if (res.status === 400 || res.status === 403) return { valid: false, error: 'Invalid API key' };
      return { valid: false, error: `Gemini API returned ${res.status}` };
    }

    return { valid: false, error: 'Unknown provider' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (msg.includes('abort') || msg.includes('timeout')) return { valid: false, error: 'Request timed out' };
    if (msg.includes('ENOTFOUND') || msg.includes('fetch')) return { valid: false, error: 'Network error — check internet connection' };
    return { valid: false, error: msg };
  }
});

ipcMain.handle('save-api-config', async (_, { provider, apiKey }: { provider: string; apiKey: string }) => {
  const projectRoot = getProjectRoot();
  mkdirSync(projectRoot, { recursive: true });
  const envPath = join(projectRoot, '.env');

  let envContent = '';
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf-8');
  }

  const keyMap: Record<string, string> = {
    claude: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    gemini: 'GEMINI_API_KEY',
  };

  const envKey = keyMap[provider];
  if (!envKey) return false;

  const updates: Record<string, string> = { LLM_PROVIDER: provider, [envKey]: apiKey };

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  writeFileSync(envPath, envContent.trim() + '\n');
  return true;
});

ipcMain.handle('get-local-config', () => {
  const projectRoot = getProjectRoot();
  const envPath = join(projectRoot, '.env');
  const config = {
    provider: null as string | null,
    model: null as string | null,
    apiKeys: { claude: false, openai: false, gemini: false },
    server: { httpPort: 13000, webhookPort: 3001, websocketPort: 18789 },
    github: { configured: false },
    gitlab: { configured: false },
    bitbucket: { configured: false },
    slack: { configured: false },
    logging: { level: 'info' },
  };

  if (!existsSync(envPath)) return config;

  const envContent = readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of envContent.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.substring(0, eq).trim()] = t.substring(eq + 1).trim();
  }

  config.provider = env.LLM_PROVIDER || null;
  config.server.httpPort = parseInt(env.HTTP_PORT || '13000');
  config.server.webhookPort = parseInt(env.WEBHOOK_PORT || '3001');
  config.server.websocketPort = parseInt(env.WEBSOCKET_PORT || '18789');

  const isReal = (v?: string) => !!v && v.length > 10 && !v.startsWith('your_');
  config.apiKeys.claude = isReal(env.ANTHROPIC_API_KEY);
  config.apiKeys.openai = isReal(env.OPENAI_API_KEY);
  config.apiKeys.gemini = isReal(env.GEMINI_API_KEY);
  config.github.configured = isReal(env.GITHUB_TOKEN);
  config.gitlab.configured = isReal(env.GITLAB_TOKEN);
  config.bitbucket.configured = isReal(env.BITBUCKET_TOKEN);
  config.slack.configured = isReal(env.SLACK_BOT_TOKEN);
  config.logging.level = env.LOG_LEVEL || 'info';

  const yamlPath = join(projectRoot, '.megasloth', 'config.yaml');
  if (existsSync(yamlPath)) {
    try {
      const yaml = readFileSync(yamlPath, 'utf-8');
      const m = yaml.match(/model:\s*['"]?([^'"\n]+)/);
      if (m) config.model = m[1].trim();
    } catch {}
  }

  return config;
});

ipcMain.handle('test-provider', async (_, provider: string) => {
  const projectRoot = getProjectRoot();
  const envPath = join(projectRoot, '.env');

  if (!existsSync(envPath)) return { provider, valid: false, error: 'No configuration found' };

  const envContent = readFileSync(envPath, 'utf-8');
  const keyMap: Record<string, string> = { claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };
  const envKey = keyMap[provider];
  if (!envKey) return { provider, valid: false, error: 'Unknown provider' };

  const match = envContent.match(new RegExp(`^${envKey}=(.+)$`, 'm'));
  const apiKey = match ? match[1].trim() : '';
  if (!apiKey || apiKey.length < 10 || apiKey.startsWith('your_')) {
    return { provider, valid: false, error: 'No API key configured' };
  }

  try {
    if (provider === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return { provider, valid: true };
      if (res.status === 401) return { provider, valid: false, error: 'Invalid API key' };
      return { provider, valid: false, error: `Anthropic API returned ${res.status}` };
    }
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return { provider, valid: true };
      if (res.status === 401) return { provider, valid: false, error: 'Invalid API key' };
      return { provider, valid: false, error: `OpenAI API returned ${res.status}` };
    }
    if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return { provider, valid: true };
      if (res.status === 400 || res.status === 403) return { provider, valid: false, error: 'Invalid API key' };
      return { provider, valid: false, error: `Gemini API returned ${res.status}` };
    }
    return { provider, valid: false, error: 'Unknown provider' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (msg.includes('abort') || msg.includes('timeout')) return { provider, valid: false, error: 'Request timed out' };
    if (msg.includes('ENOTFOUND') || msg.includes('fetch')) return { provider, valid: false, error: 'Network error' };
    return { provider, valid: false, error: msg };
  }
});

// ── Chat Engine ──────────────────────────────────────────────────

interface ChatMsg { role: string; content: string; timestamp?: number }

const MAX_CONTEXT_TOKENS = 24000;
const SUMMARY_THRESHOLD = 20000;

function estimateTokens(text: string): number { return Math.ceil(text.length / 3.5); }
function historyTokens(msgs: ChatMsg[]): number { return msgs.reduce((s, m) => s + estimateTokens(m.content), 0); }

function getChatDataDir(): string {
  const dir = join(app.getPath('userData'), 'chat');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function loadChatHistory(): ChatMsg[] {
  const p = join(getChatDataDir(), 'history.json');
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return []; }
}

function saveChatHistory(msgs: ChatMsg[]) {
  writeFileSync(join(getChatDataDir(), 'history.json'), JSON.stringify(msgs));
}

// Graph memory — lightweight entity/fact extraction stored as JSON
interface GraphNode { id: string; label: string; facts: string[]; embedding?: number[]; updated: number }
interface GraphEdge { source: string; target: string; relation: string }
interface KnowledgeGraph { nodes: GraphNode[]; edges: GraphEdge[] }

function loadGraph(): KnowledgeGraph {
  const p = join(getChatDataDir(), 'graph.json');
  if (!existsSync(p)) return { nodes: [], edges: [] };
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return { nodes: [], edges: [] }; }
}

function saveGraph(g: KnowledgeGraph) {
  writeFileSync(join(getChatDataDir(), 'graph.json'), JSON.stringify(g));
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const data = await res.json() as { data?: Array<{ embedding: number[] }> };
  return data.data?.[0]?.embedding || [];
}

async function extractAndUpdateGraph(userMsg: string, assistantMsg: string, env: Record<string, string>) {
  const graph = loadGraph();
  const openaiKey = env.OPENAI_API_KEY;
  if (!openaiKey || openaiKey.length < 10 || openaiKey.startsWith('your_')) { saveGraph(graph); return; }

  const resolved = resolveApiKey(env);
  if (!resolved) return;

  try {
    const extractPrompt = `Extract key entities and relationships from this conversation turn. Return JSON only.
Format: {"entities":[{"name":"...","facts":["..."]}],"relations":[{"source":"...","target":"...","relation":"..."}]}
User: ${userMsg.slice(0, 2000)}
Assistant: ${assistantMsg.slice(0, 2000)}`;

    let extractJson = '';
    if (resolved.provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': resolved.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [{ role: 'user', content: extractPrompt }] }),
        signal: AbortSignal.timeout(30000),
      });
      if (r.ok) {
        const d = await r.json() as { content: Array<{ text: string }> };
        extractJson = d.content?.[0]?.text || '';
      }
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1024, messages: [{ role: 'user', content: extractPrompt }] }),
        signal: AbortSignal.timeout(30000),
      });
      if (r.ok) {
        const d = await r.json() as { choices: Array<{ message: { content: string } }> };
        extractJson = d.choices?.[0]?.message?.content || '';
      }
    }

    const match = extractJson.match(/\{[\s\S]*\}/);
    if (!match) { saveGraph(graph); return; }
    const parsed = JSON.parse(match[0]) as { entities?: Array<{ name: string; facts: string[] }>; relations?: Array<{ source: string; target: string; relation: string }> };

    for (const ent of parsed.entities || []) {
      const id = ent.name.toLowerCase().replace(/\s+/g, '_');
      const existing = graph.nodes.find(n => n.id === id);
      if (existing) {
        for (const f of ent.facts) { if (!existing.facts.includes(f)) existing.facts.push(f); }
        existing.updated = Date.now();
      } else {
        const emb = await getEmbedding(ent.name + ': ' + ent.facts.join('. '), openaiKey);
        graph.nodes.push({ id, label: ent.name, facts: ent.facts, embedding: emb.length ? emb : undefined, updated: Date.now() });
      }
    }
    for (const rel of parsed.relations || []) {
      const sid = rel.source.toLowerCase().replace(/\s+/g, '_');
      const tid = rel.target.toLowerCase().replace(/\s+/g, '_');
      if (!graph.edges.find(e => e.source === sid && e.target === tid && e.relation === rel.relation)) {
        graph.edges.push({ source: sid, target: tid, relation: rel.relation });
      }
    }
    saveGraph(graph);
  } catch { saveGraph(graph); }
}

async function retrieveGraphContext(query: string, env: Record<string, string>): Promise<string> {
  const graph = loadGraph();
  if (!graph.nodes.length) return '';
  const openaiKey = env.OPENAI_API_KEY;
  if (!openaiKey || openaiKey.length < 10 || openaiKey.startsWith('your_')) return '';

  const queryEmb = await getEmbedding(query, openaiKey);
  if (!queryEmb.length) return '';

  const scored = graph.nodes
    .filter(n => n.embedding?.length)
    .map(n => ({ node: n, score: cosineSim(queryEmb, n.embedding!) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .filter(s => s.score > 0.3);

  if (!scored.length) return '';

  const lines = scored.map(s => {
    const rels = graph.edges.filter(e => e.source === s.node.id || e.target === s.node.id);
    const relStr = rels.map(r => `${r.source} -[${r.relation}]-> ${r.target}`).join('; ');
    return `[${s.node.label}] ${s.node.facts.join('. ')}${relStr ? ' | Relations: ' + relStr : ''}`;
  });
  return `<memory>\n${lines.join('\n')}\n</memory>`;
}

function resolveApiKey(env: Record<string, string>): { provider: string; apiKey: string } | null {
  const provider = env.LLM_PROVIDER || 'claude';
  const keyMap: Record<string, string> = { claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };
  const apiKey = env[keyMap[provider] || ''] || '';
  if (!apiKey || apiKey.length < 10 || apiKey.startsWith('your_')) return null;
  return { provider, apiKey };
}

async function summarizeHistory(msgs: ChatMsg[], provider: string, apiKey: string): Promise<ChatMsg[]> {
  const toSummarize = msgs.slice(0, -4);
  const keep = msgs.slice(-4);
  const text = toSummarize.map(m => `${m.role}: ${m.content}`).join('\n').slice(0, 12000);
  const prompt = `Summarize this conversation concisely, preserving all key facts, decisions, and context:\n${text}`;

  let summary = '';
  try {
    if (provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(30000),
      });
      if (r.ok) { const d = await r.json() as { content: Array<{ text: string }> }; summary = d.content?.[0]?.text || ''; }
    } else if (provider === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(30000),
      });
      if (r.ok) { const d = await r.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> }; summary = d.candidates?.[0]?.content?.parts?.[0]?.text || ''; }
    } else {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(30000),
      });
      if (r.ok) { const d = await r.json() as { choices: Array<{ message: { content: string } }> }; summary = d.choices?.[0]?.message?.content || ''; }
    }
  } catch {}

  if (!summary) return msgs.slice(-6);
  return [{ role: 'system', content: `Previous conversation summary:\n${summary}`, timestamp: Date.now() }, ...keep];
}

// ── Agent Tools ─────────────────────────────────────────────────

interface ToolCall { id: string; name: string; input: Record<string, unknown> }

const AGENT_TOOLS = [
  {
    name: 'execute_command',
    description: 'Execute a shell command. Use for git operations (status, log, diff, commit, push, pull, branch), build commands, package management (npm, pnpm), docker, curl, system utilities, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string' as const, description: 'Shell command to execute' },
        cwd: { type: 'string' as const, description: 'Working directory (defaults to project root)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file from the filesystem',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' as const, description: 'File path (absolute or relative to project root)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file. Creates parent directories if needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' as const, description: 'File path' },
        content: { type: 'string' as const, description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories with types and sizes',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' as const, description: 'Directory path (defaults to project root)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for text patterns in files recursively using grep',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: { type: 'string' as const, description: 'Search pattern (regex)' },
        path: { type: 'string' as const, description: 'Directory to search in (defaults to project root)' },
        include: { type: 'string' as const, description: 'File glob to include (e.g., "*.ts")' },
      },
      required: ['pattern'],
    },
  },
];

function buildSystemPrompt(): string {
  const projectRoot = getProjectRoot();
  const env = parseEnvFile();
  const platforms: string[] = [];
  const isReal = (v?: string) => !!v && v.length > 10 && !v.startsWith('your_');
  if (isReal(env.GITHUB_TOKEN)) platforms.push('GitHub');
  if (isReal(env.GITLAB_TOKEN)) platforms.push('GitLab');
  if (isReal(env.BITBUCKET_TOKEN)) platforms.push('Bitbucket');

  return `You are MegaSloth, an AI-powered full automation DevOps agent that monitors and manages Git repositories and development workflows.

Project root: ${projectRoot}
${platforms.length ? `Connected Git platforms: ${platforms.join(', ')}` : 'No Git platform tokens configured yet.'}

You have access to these tools:
- execute_command: Run any shell command (git, npm, pnpm, docker, curl, etc.)
- read_file: Read file contents
- write_file: Create or modify files
- list_directory: List directory contents
- search_files: Search for text patterns in code

CRITICAL INSTRUCTIONS:
1. You are NOT a basic chatbot. You are an autonomous agent with FULL system access.
2. When users ask about their repo, code, builds, or anything requiring data — USE YOUR TOOLS to check and respond with REAL data.
3. Don't just describe what you would do — ACTUALLY DO IT using tools.
4. After making changes, VERIFY them (e.g., run the command, read the file, check git status).
5. Be proactive: when reviewing code, actually read it. When debugging, actually run commands.
6. Format responses in markdown. Use code blocks for command outputs.
7. For git operations, always use execute_command with the appropriate git command.
8. Always respond in Korean unless the user writes in another language.`;
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  const projectRoot = getProjectRoot();
  switch (name) {
    case 'execute_command': {
      const cmd = input.command as string;
      const cwd = (input.cwd as string) || projectRoot;
      try {
        const { stdout, stderr } = await execAsync(cmd, {
          cwd, timeout: 60000, maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
        return (stdout + (stderr ? '\nSTDERR:\n' + stderr : '')).trim() || '(no output)';
      } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; message?: string };
        return ((err.stdout || '') + (err.stderr ? '\nSTDERR:\n' + err.stderr : '')).trim() || `Command failed: ${err.message || 'unknown'}`;
      }
    }
    case 'read_file': {
      const p = input.path as string;
      const abs = p.startsWith('/') ? p : join(projectRoot, p);
      if (!existsSync(abs)) return `File not found: ${abs}`;
      const c = readFileSync(abs, 'utf-8');
      return c.length > 100000 ? c.slice(0, 100000) + '\n...(truncated at 100KB)' : c;
    }
    case 'write_file': {
      const p = input.path as string;
      const abs = p.startsWith('/') ? p : join(projectRoot, p);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, input.content as string);
      return `File written: ${abs} (${(input.content as string).length} bytes)`;
    }
    case 'list_directory': {
      const p = (input.path as string) || '.';
      const abs = p.startsWith('/') ? p : join(projectRoot, p);
      if (!existsSync(abs)) return `Directory not found: ${abs}`;
      const entries = readdirSync(abs);
      const lines = entries.slice(0, 200).map(e => {
        try {
          const s = statSync(join(abs, e));
          return `${s.isDirectory() ? 'd' : '-'} ${e}${s.isDirectory() ? '/' : ''} (${s.size}B)`;
        } catch { return `? ${e}`; }
      });
      if (entries.length > 200) lines.push(`... and ${entries.length - 200} more`);
      return lines.join('\n') || '(empty directory)';
    }
    case 'search_files': {
      const pattern = input.pattern as string;
      const p = (input.path as string) || '.';
      const abs = p.startsWith('/') ? p : join(projectRoot, p);
      const include = input.include ? `--include="${input.include}"` : '';
      try {
        const { stdout } = await execAsync(
          `grep -rn ${include} -- "${pattern}" "${abs}" 2>/dev/null | head -100`,
          { timeout: 15000, maxBuffer: 1024 * 1024 },
        );
        return stdout.trim() || 'No matches found';
      } catch { return 'No matches found'; }
    }
    default: return `Unknown tool: ${name}`;
  }
}

// Claude streaming with tool_use support
async function streamClaudeWithTools(
  apiKey: string, systemPrompt: string,
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>,
  onTextChunk: (t: string) => void,
): Promise<{ text: string; toolCalls: ToolCall[]; stopReason: string }> {
  const reqBody = {
    model: 'claude-sonnet-4-6', max_tokens: 8192, system: systemPrompt,
    tools: AGENT_TOOLS, stream: true, messages,
  };
  console.log(`[MegaSloth Claude] Sending request: model=${reqBody.model}, tools=${reqBody.tools.length}, msgs=${reqBody.messages.length}`);
  console.log(`[MegaSloth Claude] Tool names: ${reqBody.tools.map(t => t.name).join(', ')}`);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(reqBody),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(e?.error?.message || `Claude API error ${res.status}`);
  }
  let fullText = '';
  const toolCalls: ToolCall[] = [];
  let curTool: Partial<ToolCall> | null = null;
  let curInput = '';
  let stopReason = 'end_turn';
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const d = line.slice(6);
      if (d === '[DONE]') continue;
      try {
        const e = JSON.parse(d);
        if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
          curTool = { id: e.content_block.id, name: e.content_block.name };
          curInput = '';
        } else if (e.type === 'content_block_delta') {
          if (e.delta?.type === 'text_delta' && e.delta.text) {
            fullText += e.delta.text; onTextChunk(e.delta.text);
          } else if (e.delta?.type === 'input_json_delta' && e.delta.partial_json) {
            curInput += e.delta.partial_json;
          }
        } else if (e.type === 'content_block_stop' && curTool) {
          try { curTool.input = JSON.parse(curInput); } catch { curTool.input = {}; }
          toolCalls.push(curTool as ToolCall);
          curTool = null; curInput = '';
        } else if (e.type === 'message_delta' && e.delta?.stop_reason) {
          stopReason = e.delta.stop_reason;
        }
      } catch {}
    }
  }
  return { text: fullText, toolCalls, stopReason };
}

// OpenAI streaming with function calling (Chat Completions API)
async function streamOpenAIWithTools(
  apiKey: string, systemPrompt: string,
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>,
  onTextChunk: (t: string) => void,
): Promise<{ text: string; toolCalls: ToolCall[]; hasToolCalls: boolean }> {
  const oaiMsgs: Array<Record<string, unknown>> = [{ role: 'system', content: systemPrompt }];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      oaiMsgs.push({ role: m.role, content: m.content });
    } else if (Array.isArray(m.content)) {
      if (m.role === 'user') {
        for (const block of m.content) {
          const b = block as Record<string, unknown>;
          if (b.type === 'tool_result') {
            oaiMsgs.push({ role: 'tool', tool_call_id: b.tool_use_id, content: String(b.content) });
          }
        }
      } else if (m.role === 'assistant') {
        const arr = m.content as Array<Record<string, unknown>>;
        const texts = arr.filter(c => c.type === 'text').map(c => String(c.text)).join('');
        const tcs = arr.filter(c => c.type === 'tool_use');
        oaiMsgs.push({
          role: 'assistant', content: texts || null,
          ...(tcs.length ? { tool_calls: tcs.map(tc => ({
            id: tc.id, type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          })) } : {}),
        });
      }
    }
  }
  const oaiTools = AGENT_TOOLS.map(t => ({
    type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o', max_tokens: 8192, tools: oaiTools, stream: true, messages: oaiMsgs }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(e?.error?.message || `OpenAI API error ${res.status}`);
  }
  let fullText = '';
  const tcAcc = new Map<number, { id: string; name: string; args: string }>();
  let hasToolCalls = false;
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const d = line.slice(6);
      if (d === '[DONE]') continue;
      try {
        const e = JSON.parse(d);
        const delta = e.choices?.[0]?.delta;
        if (delta?.content) { fullText += delta.content; onTextChunk(delta.content); }
        if (delta?.tool_calls) {
          hasToolCalls = true;
          for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
            const idx = tc.index as number;
            if (!tcAcc.has(idx)) tcAcc.set(idx, { id: '', name: '', args: '' });
            const acc = tcAcc.get(idx)!;
            if (tc.id) acc.id = tc.id as string;
            const fn = tc.function as Record<string, string> | undefined;
            if (fn?.name) acc.name = fn.name;
            if (fn?.arguments) acc.args += fn.arguments;
          }
        }
        if (e.choices?.[0]?.finish_reason === 'tool_calls') hasToolCalls = true;
      } catch {}
    }
  }
  const toolCalls: ToolCall[] = [];
  for (const [, acc] of tcAcc) {
    try { toolCalls.push({ id: acc.id, name: acc.name, input: JSON.parse(acc.args) }); }
    catch { toolCalls.push({ id: acc.id, name: acc.name, input: {} }); }
  }
  return { text: fullText, toolCalls, hasToolCalls: hasToolCalls || toolCalls.length > 0 };
}

// Gemini basic streaming (tool support can be added later)
async function streamGeminiBasic(
  apiKey: string,
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>,
  onChunk: (t: string) => void,
): Promise<string> {
  const contents = messages
    .filter(m => typeof m.content === 'string')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content as string }] }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: buildSystemPrompt() }] } }),
      signal: AbortSignal.timeout(180000) },
  );
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(e?.error?.message || `Gemini API error ${res.status}`);
  }
  let full = '';
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const e = JSON.parse(line.slice(6));
        const t = e.candidates?.[0]?.content?.parts?.[0]?.text;
        if (t) { full += t; onChunk(t); }
      } catch {}
    }
  }
  return full;
}

// Agent loop: LLM call → tool execution → repeat until done
async function runAgentLoop(
  provider: string, apiKey: string, history: ChatMsg[],
  onTextChunk: (t: string) => void,
  onToolStatus: (s: { tool: string; args: string; output?: string; state: 'running' | 'done' | 'error' }) => void,
): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const maxTurns = 15;

  const apiMsgs: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = [];
  for (const m of history) {
    if (m.role === 'system') continue;
    apiMsgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }

  console.log(`[MegaSloth Agent] provider=${provider}, messages=${apiMsgs.length}, tools=${AGENT_TOOLS.length}`);

  let turns = 0;
  let fullText = '';

  while (turns < maxTurns) {
    turns++;

    if (provider === 'claude') {
      const { text, toolCalls, stopReason } = await streamClaudeWithTools(apiKey, systemPrompt, apiMsgs, onTextChunk);
      console.log(`[MegaSloth Agent] turn=${turns}, stopReason=${stopReason}, toolCalls=${toolCalls.length}, textLen=${text.length}`);
      fullText += text;
      if (stopReason !== 'tool_use' || !toolCalls.length) break;

      const aContent: Array<Record<string, unknown>> = [];
      if (text) aContent.push({ type: 'text', text });
      for (const tc of toolCalls) aContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      apiMsgs.push({ role: 'assistant', content: aContent });

      const tResults: Array<Record<string, unknown>> = [];
      for (const tc of toolCalls) {
        const args = Object.entries(tc.input).map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`).join(', ');
        onToolStatus({ tool: tc.name, args, state: 'running' });
        try {
          const out = await executeTool(tc.name, tc.input);
          const trunc = out.length > 50000 ? out.slice(0, 50000) + '\n...(truncated)' : out;
          tResults.push({ type: 'tool_result', tool_use_id: tc.id, content: trunc });
          onToolStatus({ tool: tc.name, args, output: trunc.slice(0, 500), state: 'done' });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Tool failed';
          tResults.push({ type: 'tool_result', tool_use_id: tc.id, content: `Error: ${msg}`, is_error: true });
          onToolStatus({ tool: tc.name, args, output: msg, state: 'error' });
        }
      }
      apiMsgs.push({ role: 'user', content: tResults });

    } else if (provider === 'openai') {
      const { text, toolCalls, hasToolCalls } = await streamOpenAIWithTools(apiKey, systemPrompt, apiMsgs, onTextChunk);
      fullText += text;
      if (!hasToolCalls || !toolCalls.length) break;

      const aContent: Array<Record<string, unknown>> = [];
      if (text) aContent.push({ type: 'text', text });
      for (const tc of toolCalls) aContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      apiMsgs.push({ role: 'assistant', content: aContent });

      const tResults: Array<Record<string, unknown>> = [];
      for (const tc of toolCalls) {
        const args = Object.entries(tc.input).map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`).join(', ');
        onToolStatus({ tool: tc.name, args, state: 'running' });
        try {
          const out = await executeTool(tc.name, tc.input);
          const trunc = out.length > 50000 ? out.slice(0, 50000) + '\n...(truncated)' : out;
          tResults.push({ type: 'tool_result', tool_use_id: tc.id, content: trunc });
          onToolStatus({ tool: tc.name, args, output: trunc.slice(0, 500), state: 'done' });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Tool failed';
          tResults.push({ type: 'tool_result', tool_use_id: tc.id, content: `Error: ${msg}`, is_error: true });
          onToolStatus({ tool: tc.name, args, output: msg, state: 'error' });
        }
      }
      apiMsgs.push({ role: 'user', content: tResults });

    } else {
      fullText = await streamGeminiBasic(apiKey, apiMsgs, onTextChunk);
      break;
    }
  }

  return fullText;
}

let chatHistory: ChatMsg[] = loadChatHistory();

ipcMain.handle('chat-stream', async (_, message: string) => {
  const env = parseEnvFile();
  const resolved = resolveApiKey(env);
  if (!resolved) return { error: 'No API key configured. Go to Settings to add one.' };

  chatHistory.push({ role: 'user', content: message, timestamp: Date.now() });

  if (historyTokens(chatHistory) > SUMMARY_THRESHOLD) {
    chatHistory = await summarizeHistory(chatHistory, resolved.provider, resolved.apiKey);
  }

  const graphCtx = await retrieveGraphContext(message, env);
  if (graphCtx) {
    chatHistory = [
      { role: 'system', content: graphCtx, timestamp: Date.now() },
      ...chatHistory.filter(m => !(m.role === 'system' && m.content.startsWith('<memory>'))),
    ];
  }

  try {
    const onChunk = (t: string) => mainWindow?.webContents.send('chat-chunk', t);
    const onTool = (s: { tool: string; args: string; output?: string; state: string }) =>
      mainWindow?.webContents.send('chat-tool-status', s);

    const fullResponse = await runAgentLoop(resolved.provider, resolved.apiKey, chatHistory, onChunk, onTool);

    chatHistory.push({ role: 'assistant', content: fullResponse, timestamp: Date.now() });
    saveChatHistory(chatHistory);
    mainWindow?.webContents.send('chat-done', { provider: resolved.provider });

    extractAndUpdateGraph(message, fullResponse, env).catch(() => {});
    return { ok: true };
  } catch (e) {
    chatHistory.pop();
    saveChatHistory(chatHistory);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    mainWindow?.webContents.send('chat-error', msg);
    return { error: msg };
  }
});

ipcMain.handle('load-chat-history', () => chatHistory.filter(m => m.role !== 'system'));

ipcMain.handle('clear-chat', () => {
  chatHistory = [];
  saveChatHistory([]);
  return true;
});

ipcMain.handle('get-chat-status', () => {
  const env = parseEnvFile();
  const resolved = resolveApiKey(env);
  return { ready: !!resolved, provider: resolved?.provider || null };
});

// ── Repository Discovery ─────────────────────────────────────────

function parseEnvFile(): Record<string, string> {
  const envPath = join(getProjectRoot(), '.env');
  if (!existsSync(envPath)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.substring(0, eq).trim()] = t.substring(eq + 1).trim();
  }
  return env;
}

interface RepoInfo {
  provider: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  url: string;
  private: boolean;
  description: string;
  language: string;
  updatedAt: string;
}

async function fetchGitHubRepos(token: string): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const res = await fetch(`https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated`, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) break;
    const data = await res.json() as Array<{
      full_name: string; owner: { login: string }; name: string;
      default_branch: string; html_url: string; private: boolean;
      description: string | null; language: string | null; updated_at: string;
    }>;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const r of data) {
      repos.push({
        provider: 'github', owner: r.owner.login, name: r.name,
        fullName: r.full_name, defaultBranch: r.default_branch || 'main',
        url: r.html_url, private: r.private,
        description: r.description || '', language: r.language || '',
        updatedAt: r.updated_at,
      });
    }
    if (data.length < perPage) break;
    page++;
    if (page > 5) break;
  }
  return repos;
}

async function fetchGitLabRepos(token: string, baseUrl: string): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = [];
  let page = 1;
  const perPage = 100;
  const apiBase = baseUrl.replace(/\/$/, '');
  while (true) {
    const res = await fetch(`${apiBase}/api/v4/projects?membership=true&per_page=${perPage}&page=${page}&order_by=updated_at`, {
      headers: { 'PRIVATE-TOKEN': token },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) break;
    const data = await res.json() as Array<{
      path_with_namespace: string; namespace: { path: string }; path: string;
      default_branch: string; web_url: string;
      visibility: string; description: string | null;
      last_activity_at: string;
    }>;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const r of data) {
      repos.push({
        provider: 'gitlab', owner: r.namespace.path, name: r.path,
        fullName: r.path_with_namespace, defaultBranch: r.default_branch || 'main',
        url: r.web_url, private: r.visibility !== 'public',
        description: r.description || '', language: '',
        updatedAt: r.last_activity_at,
      });
    }
    if (data.length < perPage) break;
    page++;
    if (page > 5) break;
  }
  return repos;
}

async function fetchBitbucketRepos(token: string): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = [];
  const res = await fetch('https://api.bitbucket.org/2.0/user', {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return repos;
  const user = await res.json() as { username: string };
  const repoRes = await fetch(`https://api.bitbucket.org/2.0/repositories/${user.username}?pagelen=100&sort=-updated_on`, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!repoRes.ok) return repos;
  const data = await repoRes.json() as { values: Array<{
    full_name: string; slug: string; is_private: boolean;
    description: string; language: string; updated_on: string;
    mainbranch?: { name: string };
    links: { html: { href: string } };
    owner: { username: string };
  }> };
  if (data.values) {
    for (const r of data.values) {
      repos.push({
        provider: 'bitbucket', owner: r.owner.username, name: r.slug,
        fullName: r.full_name, defaultBranch: r.mainbranch?.name || 'main',
        url: r.links.html.href, private: r.is_private,
        description: r.description || '', language: r.language || '',
        updatedAt: r.updated_on,
      });
    }
  }
  return repos;
}

ipcMain.handle('fetch-repositories', async () => {
  const env = parseEnvFile();
  const isReal = (v?: string) => !!v && v.length > 10 && !v.startsWith('your_');
  const results: { repos: RepoInfo[]; errors: Array<{ provider: string; error: string }> } = { repos: [], errors: [] };

  const tasks: Promise<void>[] = [];

  if (isReal(env.GITHUB_TOKEN)) {
    tasks.push(
      fetchGitHubRepos(env.GITHUB_TOKEN)
        .then(r => { results.repos.push(...r); })
        .catch(e => { results.errors.push({ provider: 'github', error: e instanceof Error ? e.message : 'Failed' }); })
    );
  }

  if (isReal(env.GITLAB_TOKEN)) {
    const url = env.GITLAB_URL || 'https://gitlab.com';
    tasks.push(
      fetchGitLabRepos(env.GITLAB_TOKEN, url)
        .then(r => { results.repos.push(...r); })
        .catch(e => { results.errors.push({ provider: 'gitlab', error: e instanceof Error ? e.message : 'Failed' }); })
    );
  }

  if (isReal(env.BITBUCKET_TOKEN)) {
    tasks.push(
      fetchBitbucketRepos(env.BITBUCKET_TOKEN)
        .then(r => { results.repos.push(...r); })
        .catch(e => { results.errors.push({ provider: 'bitbucket', error: e instanceof Error ? e.message : 'Failed' }); })
    );
  }

  if (tasks.length === 0) {
    return { repos: [], errors: [{ provider: 'none', error: 'No Git platform tokens configured. Add tokens in Settings.' }] };
  }

  await Promise.all(tasks);
  results.repos.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return results;
});

// ── Application Menu ────────────────────────────────────────────

function buildAppMenu() {
  const appName = 'MegaSloth';
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: appName,
      submenu: [
        { label: `About ${appName}`, role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
        { type: 'separator' },
        { label: `Hide ${appName}`, role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: `Quit ${appName}`, role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        { type: 'separator' }, { role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App Lifecycle ───────────────────────────────────────────────

app.whenReady().then(async () => {
  buildAppMenu();
  await createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    stopCore();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopCore();
});
