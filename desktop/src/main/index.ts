import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fork, type ChildProcess } from 'node:child_process';

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
