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
  isOnboarded: () => ipcRenderer.invoke('is-onboarded'),
  completeOnboarding: () => ipcRenderer.invoke('complete-onboarding'),
  validateApiKey: (config: { provider: string; apiKey: string }) =>
    ipcRenderer.invoke('validate-api-key', config),
  saveApiConfig: (config: { provider: string; apiKey: string }) =>
    ipcRenderer.invoke('save-api-config', config),
  getLocalConfig: () => ipcRenderer.invoke('get-local-config'),
  testProvider: (provider: string) =>
    ipcRenderer.invoke('test-provider', provider),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme: string) => ipcRenderer.invoke('set-theme', theme),
  fetchRepositories: () => ipcRenderer.invoke('fetch-repositories'),
  chat: (message: string) => ipcRenderer.invoke('chat', message),
  clearChat: () => ipcRenderer.invoke('clear-chat'),
  getChatStatus: () => ipcRenderer.invoke('get-chat-status'),
});
