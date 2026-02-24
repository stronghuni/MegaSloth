import React, { useEffect, useState } from 'react';
import { Cpu, Check, X, Loader2 } from 'lucide-react';

interface LocalConfig {
  provider: string | null;
  apiKeys: { claude: boolean; openai: boolean; gemini: boolean };
}

const PROVIDERS = [
  { name: 'claude', displayName: 'Claude (Anthropic)', models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'] },
  { name: 'openai', displayName: 'OpenAI', models: ['gpt-5.2', 'gpt-5.2-mini', 'o3-pro'] },
  { name: 'gemini', displayName: 'Gemini (Google)', models: ['gemini-3.1-pro', 'gemini-3.1-flash'] },
];

const PROVIDER_COLORS: Record<string, string> = {
  claude: 'bg-purple-500',
  openai: 'bg-emerald-500',
  gemini: 'bg-blue-500',
};

export function Providers() {
  const [active, setActive] = useState('');
  const [apiKeys, setApiKeys] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState('');
  const [testResult, setTestResult] = useState<{ provider: string; valid: boolean; error?: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const data = await window.megasloth?.getLocalConfig() as LocalConfig | null;
    if (data) {
      setActive(data.provider || '');
      setApiKeys(data.apiKeys || {});
    }
  };

  const handleTest = async (provider: string) => {
    setTesting(provider);
    setTestResult(null);
    try {
      const result = await window.megasloth?.testProvider(provider);
      if (result) {
        setTestResult(result as { provider: string; valid: boolean; error?: string });
      } else {
        setTestResult({ provider, valid: false, error: 'Could not test provider' });
      }
    } catch {
      setTestResult({ provider, valid: false, error: 'Connection error' });
    }
    setTesting('');
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      <div>
        <h2 className="text-lg sm:text-xl font-semibold text-white">AI Providers</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">LLM configuration and status</p>
      </div>

      <div className="space-y-3">
        {PROVIDERS.map(p => {
          const configured = apiKeys[p.name] ?? false;
          return (
            <div key={p.name} className={`card-hover ${active === p.name ? 'border-emerald-500/40' : ''}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${PROVIDER_COLORS[p.name] || 'bg-slate-600'}/15 border border-slate-700/30`}>
                    <Cpu className={`w-4 h-4 sm:w-5 sm:h-5 ${active === p.name ? 'text-emerald-400' : 'text-slate-400'}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-white text-sm sm:text-base">{p.displayName}</h3>
                      {active === p.name && (
                        <span className="text-[10px] bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {p.models.join(', ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 pl-12 sm:pl-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span className={`text-xs ${configured ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {configured ? 'Configured' : 'Not configured'}
                    </span>
                  </div>
                  {configured && (
                    <button
                      onClick={() => handleTest(p.name)}
                      disabled={testing === p.name}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      {testing === p.name ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : 'Test'}
                    </button>
                  )}
                </div>
              </div>
              {testResult && testResult.provider === p.name && (
                <div className={`mt-3 px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                  testResult.valid ? 'bg-emerald-600/10 text-emerald-400' : 'bg-red-600/10 text-red-400'
                }`}>
                  {testResult.valid ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  {testResult.valid ? 'API key is valid' : testResult.error || 'Invalid API key'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
