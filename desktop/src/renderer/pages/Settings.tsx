import React, { useEffect, useState } from 'react';
import {
  Server,
  GitBranch,
  Bell,
  FileText,
  Key,
  Eye,
  EyeOff,
  Save,
  Check,
  AlertTriangle,
  Cpu,
  Loader2,
  X,
  Palette,
  Moon,
  Sun,
  Monitor,
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

const PROVIDERS = [
  { name: 'claude', displayName: 'Claude (Anthropic)', models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'] },
  { name: 'openai', displayName: 'OpenAI', models: ['gpt-5.2', 'gpt-5.2-mini', 'o3-pro'] },
  { name: 'gemini', displayName: 'Gemini (Google)', models: ['gemini-3.1-pro', 'gemini-3.1-flash'] },
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

  const [testing, setTesting] = useState('');
  const [testResult, setTestResult] = useState<{ provider: string; valid: boolean; error?: string } | null>(null);

  useEffect(() => {
    loadConfig();
    window.megasloth?.getTheme().then(t => setCurrentTheme(t as string || 'dark'));
  }, []);

  const loadConfig = async () => {
    const data = await window.megasloth?.getLocalConfig() as LocalConfig | null;
    if (data) {
      setConfig(data);
      if (data.provider) setApiProvider(data.provider);
    }
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

  const handleTestProvider = async (provider: string) => {
    setTesting(provider);
    setTestResult(null);
    try {
      const result = await window.megasloth?.testProvider(provider);
      if (result) {
        setTestResult(result as { provider: string; valid: boolean; error?: string });
      } else {
        setTestResult({ provider, valid: false, error: 'Could not test' });
      }
    } catch {
      setTestResult({ provider, valid: false, error: 'Connection error' });
    }
    setTesting('');
  };

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
            return (
              <div key={p.name} className={`rounded-lg p-3 border transition-all ${isActive ? 'border-emerald-500/40 bg-emerald-500/5' : ''}`} style={!isActive ? { borderColor: 'var(--border)', background: 'var(--bg-input)' } : undefined}>
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
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{p.models.join(', ')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                      <span className={`text-xs ${configured ? 'text-emerald-400' : ''}`} style={!configured ? { color: 'var(--text-muted)' } : undefined}>
                        {configured ? 'Configured' : 'Not set'}
                      </span>
                    </div>
                    {configured && (
                      <button
                        onClick={() => handleTestProvider(p.name)}
                        disabled={testing === p.name}
                        className="btn-secondary text-xs !px-2.5 !py-1"
                      >
                        {testing === p.name ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test'}
                      </button>
                    )}
                  </div>
                </div>
                {testResult && testResult.provider === p.name && (
                  <div className={`mt-2 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 ${
                    testResult.valid ? 'bg-emerald-600/10 text-emerald-400' : 'bg-red-600/10 text-red-400'
                  }`}>
                    {testResult.valid ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    {testResult.valid ? 'API key is valid' : testResult.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-4 mt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <p className="text-xs mb-3 font-medium heading-secondary">Update API Key</p>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-3">
            {([
              { id: 'claude' as const, label: 'Claude 4.6' },
              { id: 'openai' as const, label: 'GPT-5.2' },
              { id: 'gemini' as const, label: 'Gemini 3.1' },
            ]).map(p => (
              <button
                key={p.id}
                onClick={() => { setApiProvider(p.id); setValidationError(''); setSaved(false); }}
                className={`px-3 py-2 rounded-lg text-xs transition-all border ${
                  apiProvider === p.id
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : ''
                }`}
                style={apiProvider !== p.id ? { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' } : undefined}
              >
                {p.label}
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
        <StatusRow label="GitHub" configured={config?.github?.configured ?? false} />
        <StatusRow label="GitLab" configured={config?.gitlab?.configured ?? false} />
        <StatusRow label="Bitbucket" configured={config?.bitbucket?.configured ?? false} />
      </Section>

      {/* Notifications */}
      <Section title="Notifications" Icon={Bell}>
        <StatusRow label="Slack" configured={config?.slack?.configured ?? false} />
      </Section>

      {/* Logging */}
      <Section title="Logging" Icon={FileText}>
        <Row label="Level" value={config?.logging?.level ?? 'info'} />
      </Section>
    </div>
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

function StatusRow({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="label-text">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-emerald-400' : 'bg-slate-500'}`} />
        <span className={`text-sm ${configured ? 'text-emerald-400' : ''}`} style={!configured ? { color: 'var(--text-muted)' } : undefined}>
          {configured ? 'Configured' : 'Not configured'}
        </span>
      </div>
    </div>
  );
}
