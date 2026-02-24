import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Server,
  GitBranch,
  Key,
  Eye,
  EyeOff,
  Save,
  Check,
  AlertTriangle,
  Cpu,
  Loader2,
  Palette,
  Moon,
  Sun,
  Monitor,
  ExternalLink,
  Trash2,
  User,
  Terminal,
  FolderGit2,
  Copy,
  Search,
} from 'lucide-react';

interface LocalConfig {
  provider: string | null;
  model: string | null;
  apiKeys: { claude: boolean; openai: boolean; gemini: boolean };
  server: { httpPort: number; webhookPort: number; websocketPort: number };
  github: { configured: boolean };
  gitlab: { configured: boolean };
  bitbucket: { configured: boolean };
  slack: { configured: boolean };
  logging: { level: string };
}

interface GitUser {
  login: string;
  name: string;
  avatar: string;
}

interface GitPlatformConfig {
  id: string;
  name: string;
  icon: string;
  scopes: string;
  docsUrl: string;
}

const GIT_PLATFORMS: GitPlatformConfig[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: '🐙',
    scopes: 'repo, read:org, workflow, read:user',
    docsUrl: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    icon: '🦊',
    scopes: 'api, read_repository, write_repository',
    docsUrl: 'https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html',
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    icon: '🪣',
    scopes: 'Repositories (Read/Write), Pull requests',
    docsUrl: 'https://support.atlassian.com/bitbucket-cloud/docs/create-an-app-password/',
  },
];

const PROVIDERS = [
  { name: 'claude', displayName: 'Claude (Anthropic)', model: 'claude-sonnet-4-6' },
  { name: 'openai', displayName: 'OpenAI', model: 'gpt-5.2' },
  { name: 'gemini', displayName: 'Gemini (Google)', model: 'gemini-2.5-pro' },
];

const PROVIDER_COLORS: Record<string, string> = {
  claude: 'bg-purple-500/15 border-purple-500/20',
  openai: 'bg-emerald-500/15 border-emerald-500/20',
  gemini: 'bg-blue-500/15 border-blue-500/20',
};

const THEMES = [
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'auto', label: 'Auto', Icon: Monitor },
];

type ConnectMethod = 'gh-cli' | 'oauth' | 'pat';

export function Settings() {
  const [config, setConfig] = useState<LocalConfig | null>(null);
  const [currentTheme, setCurrentTheme] = useState('dark');

  const [apiProvider, setApiProvider] = useState('claude');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState('');

  const [gitUsers, setGitUsers] = useState<Record<string, GitUser | null>>({ github: null, gitlab: null, bitbucket: null });
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const [connectMethod, setConnectMethod] = useState<ConnectMethod>('gh-cli');
  const [gitTokenInput, setGitTokenInput] = useState('');
  const [gitValidating, setGitValidating] = useState(false);
  const [gitSaving, setGitSaving] = useState(false);
  const [gitSaved, setGitSaved] = useState('');
  const [gitError, setGitError] = useState('');
  const [gitRemoving, setGitRemoving] = useState('');

  // gh CLI state
  const [ghCliStatus, setGhCliStatus] = useState<{
    installed: boolean; authenticated: boolean; user?: GitUser | null;
  } | null>(null);
  const [ghImporting, setGhImporting] = useState(false);

  // OAuth Device Flow state
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthUserCode, setOauthUserCode] = useState('');
  const [oauthPolling, setOauthPolling] = useState(false);
  const [oauthStatus, setOauthStatus] = useState('');
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local repo scan
  const [localRepos, setLocalRepos] = useState<Array<{ path: string; remotes: Array<{ name: string; url: string; platform: string }> }>>([]);
  const [detectedPlatforms, setDetectedPlatforms] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showRepos, setShowRepos] = useState(false);

  useEffect(() => {
    loadConfig();
    loadGitUsers();
    detectGhCli();
    window.megasloth?.getTheme().then(t => setCurrentTheme(t as string || 'dark'));
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const loadConfig = async () => {
    const data = await window.megasloth?.getLocalConfig() as LocalConfig | null;
    if (data) {
      setConfig(data);
      if (data.provider) setApiProvider(data.provider);
    }
  };

  const loadGitUsers = async () => {
    const users = await window.megasloth?.getGitUsers();
    if (users) setGitUsers(users as Record<string, GitUser | null>);
  };

  const detectGhCli = async () => {
    const result = await window.megasloth?.detectGhCli();
    if (result) setGhCliStatus(result as { installed: boolean; authenticated: boolean; user?: GitUser | null });
  };

  const handleScanLocalRepos = async () => {
    setScanning(true);
    const result = await window.megasloth?.scanLocalRepos();
    if (result) {
      setLocalRepos(result.repos);
      setDetectedPlatforms(result.platforms);
      setShowRepos(true);
    }
    setScanning(false);
  };

  const handleImportGhToken = async () => {
    setGhImporting(true);
    setGitError('');
    const result = await window.megasloth?.importGhToken();
    if (result?.ok) {
      setGitSaved('github');
      setExpandedPlatform(null);
      await loadConfig();
      await loadGitUsers();
      setTimeout(() => setGitSaved(''), 4000);
    } else {
      setGitError(result?.error || 'Failed to import token');
    }
    setGhImporting(false);
  };

  const handleOAuthStart = async () => {
    if (!oauthClientId.trim()) {
      setGitError('GitHub OAuth App Client ID를 입력하세요');
      return;
    }
    setGitError('');
    setOauthStatus('starting');
    const result = await window.megasloth?.githubOAuthStart({ clientId: oauthClientId.trim() });
    if (result?.ok && result.userCode) {
      setOauthUserCode(result.userCode);
      setOauthPolling(true);
      setOauthStatus('waiting');
      startOAuthPolling();
    } else {
      setOauthStatus('');
      setGitError(result?.error || 'Failed to start OAuth flow');
    }
  };

  const startOAuthPolling = useCallback(() => {
    const poll = async () => {
      const result = await window.megasloth?.githubOAuthPoll({ clientId: oauthClientId.trim() });
      if (result?.status === 'success') {
        setOauthPolling(false);
        setOauthUserCode('');
        setOauthStatus('');
        setGitSaved('github');
        setExpandedPlatform(null);
        const cfg = await window.megasloth?.getLocalConfig() as LocalConfig | null;
        if (cfg) setConfig(cfg);
        const users = await window.megasloth?.getGitUsers();
        if (users) setGitUsers(users as Record<string, GitUser | null>);
        setTimeout(() => setGitSaved(''), 4000);
      } else if (result?.status === 'pending') {
        pollTimerRef.current = setTimeout(poll, (result.interval || 5) * 1000);
      } else if (result?.status === 'denied') {
        setOauthPolling(false);
        setOauthUserCode('');
        setOauthStatus('');
        setGitError('Authorization denied by user');
      } else if (result?.status === 'expired') {
        setOauthPolling(false);
        setOauthUserCode('');
        setOauthStatus('');
        setGitError('Device code expired. Try again.');
      } else {
        setOauthPolling(false);
        setOauthUserCode('');
        setOauthStatus('');
        setGitError(result?.error || 'OAuth flow failed');
      }
    };
    pollTimerRef.current = setTimeout(poll, 5000);
  }, [oauthClientId]);

  const handleOAuthCancel = async () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setOauthPolling(false);
    setOauthUserCode('');
    setOauthStatus('');
    await window.megasloth?.githubOAuthCancel();
  };

  const handleOpenTokenPage = async (platform: string) => {
    await window.megasloth?.openGitTokenPage(platform);
  };

  const handleSaveGitToken = async (platform: string) => {
    if (!gitTokenInput.trim()) return;
    setGitValidating(true);
    setGitError('');
    setGitSaved('');

    const result = await window.megasloth?.validateGitToken({ platform, token: gitTokenInput.trim() });
    if (!result?.valid) {
      setGitError(result?.error || 'Invalid token');
      setGitValidating(false);
      return;
    }

    setGitSaving(true);
    await window.megasloth?.saveGitToken({ platform, token: gitTokenInput.trim() });
    setGitSaving(false);
    setGitValidating(false);
    setGitSaved(platform);
    setGitTokenInput('');
    setExpandedPlatform(null);
    await loadConfig();
    await loadGitUsers();
    setTimeout(() => setGitSaved(''), 4000);
  };

  const handleRemoveGitToken = async (platform: string) => {
    setGitRemoving(platform);
    await window.megasloth?.removeGitToken({ platform });
    setGitRemoving('');
    setGitUsers(prev => ({ ...prev, [platform]: null }));
    await loadConfig();
  };

  const handleSwitchProvider = async (provider: string) => {
    const configured = config?.apiKeys?.[provider as keyof typeof config.apiKeys] ?? false;
    if (!configured) return;
    await window.megasloth?.switchProvider(provider);
    await loadConfig();
  };

  const handleThemeChange = async (theme: string) => {
    setCurrentTheme(theme);
    document.documentElement.setAttribute('data-theme', theme);
    await window.megasloth?.setTheme(theme);
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim() || !apiProvider) return;

    setValidating(true);
    setValidationError('');
    setSaved(false);

    try {
      const result = await window.megasloth?.validateApiKey({ provider: apiProvider, apiKey: apiKeyInput.trim() });
      if (!result?.valid) {
        setValidationError(result?.error || 'Invalid API key');
        setValidating(false);
        return;
      }

      setSaving(true);
      await window.megasloth?.saveApiConfig({ provider: apiProvider, apiKey: apiKeyInput.trim() });
      setSaved(true);
      setApiKeyInput('');
      await loadConfig();
      setTimeout(() => setSaved(false), 4000);
    } catch {
      setValidationError('Connection error');
    }

    setValidating(false);
    setSaving(false);
  };

  const renderGitHubConnectPanel = () => {
    const ghAvailable = ghCliStatus?.installed && ghCliStatus.authenticated;

    return (
      <div className="space-y-3">
        {/* Method selector */}
        <div className="flex gap-1.5">
          {ghAvailable && (
            <MethodTab
              active={connectMethod === 'gh-cli'}
              onClick={() => { setConnectMethod('gh-cli'); setGitError(''); }}
              icon={<Terminal className="w-3 h-3" />}
              label="gh CLI"
              badge="Recommended"
            />
          )}
          <MethodTab
            active={connectMethod === 'oauth'}
            onClick={() => { setConnectMethod('oauth'); setGitError(''); }}
            icon={<Key className="w-3 h-3" />}
            label="OAuth"
          />
          <MethodTab
            active={connectMethod === 'pat'}
            onClick={() => { setConnectMethod('pat'); setGitError(''); }}
            icon={<ExternalLink className="w-3 h-3" />}
            label="Token"
          />
        </div>

        {/* gh CLI method */}
        {connectMethod === 'gh-cli' && ghAvailable && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-mono text-emerald-400">gh</span> CLI에서 인증된 계정을 발견했습니다
                {ghCliStatus.user && (
                  <span className="ml-1">— <strong>{ghCliStatus.user.name}</strong> (@{ghCliStatus.user.login})</span>
                )}
              </p>
            </div>
            <button
              onClick={handleImportGhToken}
              disabled={ghImporting}
              className="btn-primary w-full py-2 text-sm flex items-center justify-center gap-2"
            >
              {ghImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
              {ghImporting ? 'Importing...' : 'Import from gh CLI'}
            </button>
          </div>
        )}

        {/* OAuth Device Flow method */}
        {connectMethod === 'oauth' && (
          <div className="space-y-2">
            {!oauthPolling ? (
              <>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  GitHub OAuth App의 Client ID가 필요합니다.{' '}
                  <a href="https://github.com/settings/developers" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
                    OAuth App 만들기
                  </a>
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  설정 시 "Enable Device Flow" 체크 필요. Callback URL은 아무 값이나 입력.
                </p>
                <input
                  type="text"
                  value={oauthClientId}
                  onChange={e => { setOauthClientId(e.target.value); setGitError(''); }}
                  placeholder="GitHub OAuth App Client ID (Ov23li...)"
                  className="input-field text-sm"
                />
                <button
                  onClick={handleOAuthStart}
                  disabled={!oauthClientId.trim() || oauthStatus === 'starting'}
                  className="btn-primary w-full py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-30"
                >
                  {oauthStatus === 'starting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  Login with GitHub
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="text-center py-3">
                  <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                    브라우저에서 아래 코드를 입력하세요:
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="text-2xl font-bold tracking-widest text-emerald-400 bg-emerald-500/10 px-4 py-2 rounded-lg border border-emerald-500/20">
                      {oauthUserCode}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(oauthUserCode)}
                      className="p-2 rounded-lg transition-colors hover:bg-white/5"
                      title="Copy code"
                    >
                      <Copy className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      인증 대기 중...
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleOAuthCancel}
                  className="btn-secondary w-full py-1.5 text-xs"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Manual PAT method */}
        {connectMethod === 'pat' && (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Personal Access Token을 생성하세요. 필요한 scopes: <span className="font-mono text-[11px] text-emerald-400">repo, read:org, workflow, read:user</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleOpenTokenPage('github')}
                className="btn-secondary text-xs !px-3 !py-1.5 flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3" />
                Token 생성 페이지 열기
              </button>
              <a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens" target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1 hover:underline" style={{ color: 'var(--text-muted)' }}>
                Docs
              </a>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={gitTokenInput}
                onChange={e => { setGitTokenInput(e.target.value); setGitError(''); }}
                placeholder="ghp_... 또는 github_pat_..."
                className="input-field text-sm flex-1"
              />
              <button
                onClick={() => handleSaveGitToken('github')}
                disabled={!gitTokenInput.trim() || gitValidating || gitSaving}
                className="btn-primary px-4 py-2 text-sm flex items-center justify-center gap-1.5 disabled:opacity-30 shrink-0"
              >
                {gitValidating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                {gitValidating ? 'Verifying...' : gitSaving ? 'Saving...' : 'Verify & Connect'}
              </button>
            </div>
          </div>
        )}

        {gitError && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {gitError}
          </p>
        )}
      </div>
    );
  };

  const renderGenericConnectPanel = (platform: GitPlatformConfig) => (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        Personal Access Token을 생성하세요. 필요한 scopes: <span className="font-mono text-[11px] text-emerald-400">{platform.scopes}</span>
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => handleOpenTokenPage(platform.id)}
          className="btn-secondary text-xs !px-3 !py-1.5 flex items-center gap-1.5"
        >
          <ExternalLink className="w-3 h-3" />
          Token 생성 페이지 열기
        </button>
        <a href={platform.docsUrl} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1 hover:underline" style={{ color: 'var(--text-muted)' }}>
          Docs
        </a>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="password"
          value={gitTokenInput}
          onChange={e => { setGitTokenInput(e.target.value); setGitError(''); }}
          placeholder={`${platform.name} token을 붙여넣기...`}
          className="input-field text-sm flex-1"
        />
        <button
          onClick={() => handleSaveGitToken(platform.id)}
          disabled={!gitTokenInput.trim() || gitValidating || gitSaving}
          className="btn-primary px-4 py-2 text-sm flex items-center justify-center gap-1.5 disabled:opacity-30 shrink-0"
        >
          {gitValidating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
          {gitValidating ? 'Verifying...' : gitSaving ? 'Saving...' : 'Verify & Connect'}
        </button>
      </div>
      {gitError && (
        <p className="text-xs text-red-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {gitError}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6 px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      <div>
        <h2 className="text-lg sm:text-xl font-semibold heading-primary">Settings</h2>
        <p className="text-xs sm:text-sm heading-secondary mt-0.5">Configuration and preferences</p>
      </div>

      {/* AI Provider */}
      <Section title="AI Provider" Icon={Cpu}>
        <div className="space-y-2">
          {PROVIDERS.map(p => {
            const configured = config?.apiKeys?.[p.name as keyof typeof config.apiKeys] ?? false;
            const isActive = config?.provider === p.name;
            const canSwitch = configured && !isActive;
            return (
              <button
                key={p.name}
                onClick={() => canSwitch && handleSwitchProvider(p.name)}
                disabled={!canSwitch}
                className={`w-full text-left rounded-lg p-3 border transition-all ${
                  isActive ? 'border-emerald-500/40 bg-emerald-500/5' : canSwitch ? 'cursor-pointer hover:border-emerald-500/20' : ''
                }`}
                style={!isActive ? { borderColor: 'var(--border)', background: 'var(--bg-input)' } : undefined}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${PROVIDER_COLORS[p.name] || ''}`}>
                      <Cpu className={`w-4 h-4 ${isActive ? 'text-emerald-400' : ''}`} style={!isActive ? { color: 'var(--text-secondary)' } : undefined} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm heading-primary">{p.displayName}</span>
                        {isActive && (
                          <span className="text-[10px] bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Active</span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>{p.model}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                      <span className={`text-xs ${configured ? 'text-emerald-400' : ''}`} style={!configured ? { color: 'var(--text-muted)' } : undefined}>
                        {configured ? (canSwitch ? 'Switch' : 'Active') : 'Not set'}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="pt-4 mt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <p className="text-xs mb-3 font-medium heading-secondary">API Key 등록</p>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-3">
            {PROVIDERS.map(p => (
              <button
                key={p.name}
                onClick={() => { setApiProvider(p.name); setValidationError(''); setSaved(false); }}
                className={`px-3 py-2 rounded-lg text-xs transition-all border ${
                  apiProvider === p.name
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : ''
                }`}
                style={apiProvider !== p.name ? { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' } : undefined}
              >
                {p.displayName.split(' ')[0]}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder={apiProvider === 'claude' ? 'sk-ant-...' : apiProvider === 'openai' ? 'sk-...' : 'AIza...'}
                className="input-field text-sm pr-10"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              onClick={handleSaveApiKey}
              disabled={!apiKeyInput.trim() || saving || validating}
              className="btn-primary px-4 py-3 sm:py-2 text-sm flex items-center justify-center gap-1.5 disabled:opacity-30 shrink-0"
            >
              {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {validating ? 'Verifying...' : saved ? 'Saved' : saving ? 'Saving...' : 'Verify & Save'}
            </button>
          </div>
          {validationError && (
            <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {validationError}
            </p>
          )}
          {saved && (
            <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 shrink-0" />
              API key verified and saved
            </p>
          )}
        </div>
      </Section>

      {/* Appearance */}
      <Section title="Appearance" Icon={Palette}>
        <div className="flex items-center justify-between">
          <span className="label-text">Theme</span>
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            {THEMES.map(t => (
              <button
                key={t.id}
                onClick={() => handleThemeChange(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  currentTheme === t.id
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : ''
                }`}
                style={currentTheme !== t.id ? { color: 'var(--text-secondary)' } : undefined}
              >
                <t.Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* Server */}
      <Section title="Server" Icon={Server}>
        <Row label="HTTP Port" value={config?.server?.httpPort ?? 13000} />
        <Row label="Webhook Port" value={config?.server?.webhookPort ?? 3001} />
        <Row label="WebSocket Port" value={config?.server?.websocketPort ?? 18789} />
      </Section>

      {/* Git Platforms */}
      <Section title="Git Platforms" Icon={GitBranch}>
        {/* Local repo scan button */}
        <div className="mb-3">
          <button
            onClick={handleScanLocalRepos}
            disabled={scanning}
            className="btn-secondary text-xs !px-3 !py-1.5 flex items-center gap-1.5"
          >
            {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            {scanning ? '스캔 중...' : '로컬 Git 저장소 스캔'}
          </button>
          {detectedPlatforms.length > 0 && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
              감지된 플랫폼: {detectedPlatforms.map(p => <span key={p} className="font-mono text-emerald-400 mr-1">{p}</span>)}
              ({localRepos.length}개 저장소)
              <button onClick={() => setShowRepos(!showRepos)} className="ml-2 text-emerald-400 hover:underline">
                {showRepos ? '접기' : '보기'}
              </button>
            </p>
          )}
          {showRepos && localRepos.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border p-2 space-y-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
              {localRepos.slice(0, 30).map((repo, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <FolderGit2 className="w-3 h-3 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-[11px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{repo.path.replace(/^\/Users\/[^/]+/, '~')}</span>
                  {repo.remotes.map((r, j) => (
                    <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 shrink-0">{r.platform}</span>
                  ))}
                </div>
              ))}
              {localRepos.length > 30 && (
                <p className="text-[11px] pt-1" style={{ color: 'var(--text-muted)' }}>+{localRepos.length - 30}개 더...</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {GIT_PLATFORMS.map(p => {
            const configured = config?.[p.id as keyof typeof config] as { configured: boolean } | undefined;
            const isConnected = configured?.configured ?? false;
            const user = gitUsers[p.id];
            const isExpanded = expandedPlatform === p.id;

            return (
              <div key={p.id} className={`rounded-lg border transition-all ${isConnected ? 'border-emerald-500/30 bg-emerald-500/5' : ''}`} style={!isConnected ? { borderColor: 'var(--border)', background: 'var(--bg-input)' } : undefined}>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl">{p.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm heading-primary">{p.name}</span>
                          {isConnected && (
                            <span className="text-[10px] bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Connected</span>
                          )}
                          {gitSaved === p.id && (
                            <span className="text-[10px] bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" /> Saved
                            </span>
                          )}
                        </div>
                        {isConnected && user ? (
                          <div className="flex items-center gap-2 mt-1">
                            {user.avatar ? (
                              <img src={user.avatar} alt={user.login} className="w-4 h-4 rounded-full" />
                            ) : (
                              <User className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                            )}
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {user.name} <span style={{ color: 'var(--text-muted)' }}>@{user.login}</span>
                            </span>
                          </div>
                        ) : !isConnected ? (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Not connected</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isConnected ? (
                        <button
                          onClick={() => handleRemoveGitToken(p.id)}
                          disabled={gitRemoving === p.id}
                          className="btn-secondary text-xs !px-2.5 !py-1 text-red-400 hover:text-red-300 hover:border-red-500/30"
                          title="Disconnect"
                        >
                          {gitRemoving === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setExpandedPlatform(isExpanded ? null : p.id);
                            setGitTokenInput('');
                            setGitError('');
                            if (p.id === 'github') {
                              const ghAvail = ghCliStatus?.installed && ghCliStatus.authenticated;
                              setConnectMethod(ghAvail ? 'gh-cli' : 'pat');
                            }
                          }}
                          className="btn-primary text-xs !px-3 !py-1"
                        >
                          {isExpanded ? 'Cancel' : 'Connect'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && !isConnected && (
                  <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    {p.id === 'github' ? renderGitHubConnectPanel() : renderGenericConnectPanel(p)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

    </div>
  );
}

function MethodTab({ active, onClick, icon, label, badge }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all border ${
        active ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : ''
      }`}
      style={!active ? { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' } : undefined}
    >
      {icon}
      {label}
      {badge && <span className="text-[9px] bg-emerald-600/20 text-emerald-400 px-1.5 py-0.5 rounded-full">{badge}</span>}
    </button>
  );
}

function Section({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <h3 className="section-title">
        <Icon className="w-4 h-4 text-emerald-500/60" /> {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="label-text">{label}</span>
      <span className="value-text">{value}</span>
    </div>
  );
}

