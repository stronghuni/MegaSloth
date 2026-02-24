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
  switchProvider: (provider: string) =>
    ipcRenderer.invoke('switch-provider', provider),
  saveApiConfig: (config: { provider: string; apiKey: string }) =>
    ipcRenderer.invoke('save-api-config', config),
  getLocalConfig: () => ipcRenderer.invoke('get-local-config'),
  testProvider: (provider: string) =>
    ipcRenderer.invoke('test-provider', provider),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme: string) => ipcRenderer.invoke('set-theme', theme),
  fetchRepositories: () => ipcRenderer.invoke('fetch-repositories'),

  validateGitToken: (config: { platform: string; token: string }) =>
    ipcRenderer.invoke('validate-git-token', config),
  saveGitToken: (config: { platform: string; token: string }) =>
    ipcRenderer.invoke('save-git-token', config),
  removeGitToken: (config: { platform: string }) =>
    ipcRenderer.invoke('remove-git-token', config),
  getGitUsers: () => ipcRenderer.invoke('get-git-users'),
  openGitTokenPage: (platform: string) =>
    ipcRenderer.invoke('open-git-token-page', platform),

  scanLocalRepos: () => ipcRenderer.invoke('scan-local-repos'),
  detectGhCli: () => ipcRenderer.invoke('detect-gh-cli'),
  importGhToken: () => ipcRenderer.invoke('import-gh-token'),
  githubOAuthStart: (config: { clientId: string }) =>
    ipcRenderer.invoke('github-oauth-start', config),
  githubOAuthPoll: (config: { clientId: string }) =>
    ipcRenderer.invoke('github-oauth-poll', config),
  githubOAuthCancel: () => ipcRenderer.invoke('github-oauth-cancel'),

  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  dismissUpdate: () => ipcRenderer.invoke('dismiss-update'),
  onUpdateAvailable: (cb: (info: {
    currentVersion: string; latestVersion: string; releaseName: string;
    releaseUrl: string; downloadUrl: string; releaseNotes: string;
  }) => void) => {
    const handler = (_: unknown, info: {
      currentVersion: string; latestVersion: string; releaseName: string;
      releaseUrl: string; downloadUrl: string; releaseNotes: string;
    }) => cb(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },

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
