import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { fork, type ChildProcess } from 'node:child_process';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let coreProcess: ChildProcess | null = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'MegaSloth',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
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

function createTray() {
  const iconPath = join(__dirname, '../../public/tray-icon.png');
  const icon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('MegaSloth');

  const updateMenu = () => {
    const isRunning = coreProcess !== null;
    const contextMenu = Menu.buildFromTemplate([
      { label: 'MegaSloth', type: 'normal', enabled: false },
      { type: 'separator' },
      { label: 'Open Dashboard', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type: 'separator' },
      { label: isRunning ? 'Stop Agent' : 'Start Agent', click: () => { isRunning ? stopCore() : startCore(); updateMenu(); } },
      { label: `Status: ${isRunning ? '● Running' : '○ Stopped'}`, enabled: false },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; stopCore(); app.quit(); } },
    ]);
    tray?.setContextMenu(contextMenu);
  };

  updateMenu();
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });

  return updateMenu;
}

function startCore() {
  if (coreProcess) return;

  const corePath = join(__dirname, '../../../dist/index.js');
  if (!existsSync(corePath)) {
    mainWindow?.webContents.send('core-status', { running: false, error: 'Core not built. Run: pnpm build' });
    return;
  }

  coreProcess = fork(corePath, [], {
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

// IPC Handlers
ipcMain.handle('get-core-status', () => ({ running: coreProcess !== null }));
ipcMain.handle('start-core', () => { startCore(); return { running: true }; });
ipcMain.handle('stop-core', () => { stopCore(); return { running: false }; });
ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('fetch-api', async (_, endpoint: string) => {
  try {
    const port = process.env.HTTP_PORT || 13000;
    const res = await fetch(`http://localhost:${port}${endpoint}`);
    return await res.json();
  } catch { return null; }
});

app.whenReady().then(() => {
  createWindow();
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
