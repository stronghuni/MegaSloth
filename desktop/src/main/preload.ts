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

  chatStream: (message: string) => ipcRenderer.invoke('chat-stream', message),
  loadChatHistory: () => ipcRenderer.invoke('load-chat-history'),
  clearChat: () => ipcRenderer.invoke('clear-chat'),
  getChatStatus: () => ipcRenderer.invoke('get-chat-status'),
  onChatChunk: (cb: (chunk: string) => void) => {
    const handler = (_: unknown, chunk: string) => cb(chunk);
    ipcRenderer.on('chat-chunk', handler);
    return () => ipcRenderer.removeListener('chat-chunk', handler);
  },
  onChatDone: (cb: (data: { provider: string }) => void) => {
    const handler = (_: unknown, data: { provider: string }) => cb(data);
    ipcRenderer.on('chat-done', handler);
    return () => ipcRenderer.removeListener('chat-done', handler);
  },
  onChatError: (cb: (error: string) => void) => {
    const handler = (_: unknown, error: string) => cb(error);
    ipcRenderer.on('chat-error', handler);
    return () => ipcRenderer.removeListener('chat-error', handler);
  },
  onChatToolStatus: (cb: (status: { tool: string; args: string; output?: string; state: string }) => void) => {
    const handler = (_: unknown, status: { tool: string; args: string; output?: string; state: string }) => cb(status);
    ipcRenderer.on('chat-tool-status', handler);
    return () => ipcRenderer.removeListener('chat-tool-status', handler);
  },
});
