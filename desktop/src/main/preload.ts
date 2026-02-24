import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('megasloth', {
  getCoreStatus: () => ipcRenderer.invoke('get-core-status'),
  startCore: () => ipcRenderer.invoke('start-core'),
  stopCore: () => ipcRenderer.invoke('stop-core'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  fetchApi: (endpoint: string, options?: { method?: string; body?: unknown }) =>
    ipcRenderer.invoke('fetch-api', endpoint, options),
  onCoreStatus: (callback: (status: { running: boolean; error?: string; exitCode?: number }) => void) => {
    ipcRenderer.on('core-status', (_, status) => callback(status));
  },
  onCoreLog: (callback: (log: string) => void) => {
    ipcRenderer.on('core-log', (_, log) => callback(log));
  },
});
