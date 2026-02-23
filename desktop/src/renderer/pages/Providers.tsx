import React, { useEffect, useState } from 'react';

interface Provider {
  name: string;
  displayName: string;
  models: string[];
  configured: boolean;
}

export function Providers() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [active, setActive] = useState('');
  const [testing, setTesting] = useState('');
  const [testResult, setTestResult] = useState<{ provider: string; valid: boolean; error?: string } | null>(null);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    const data = await window.megasloth?.fetchApi('/api/providers') as { providers: Provider[]; active: string } | null;
    if (data) {
      setProviders(data.providers);
      setActive(data.active);
    }
  };

  const testProvider = async (provider: string) => {
    setTesting(provider);
    setTestResult(null);
    try {
      const res = await fetch('http://localhost:13000/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: 'test' }),
      });
      const result = await res.json();
      setTestResult(result as { provider: string; valid: boolean; error?: string });
    } catch {
      setTestResult({ provider, valid: false, error: 'Could not reach API' });
    }
    setTesting('');
  };

  const providerIcons: Record<string, string> = {
    claude: '🟣', openai: '🟢', gemini: '🔵',
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">AI Providers</h2>

      <div className="space-y-4">
        {providers.map(p => (
          <div key={p.name} className={`card-hover ${active === p.name ? 'border-emerald-500/50' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-3xl">{providerIcons[p.name] || '🤖'}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{p.displayName}</h3>
                    {active === p.name && (
                      <span className="text-xs bg-emerald-600/20 text-emerald-400 px-2 py-0.5 rounded-full">Active</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">Models: {p.models.join(', ')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm ${p.configured ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {p.configured ? '✓ Configured' : '✗ Not configured'}
                </span>
                {p.configured && (
                  <button
                    onClick={() => testProvider(p.name)}
                    disabled={testing === p.name}
                    className="btn-secondary text-sm"
                  >
                    {testing === p.name ? 'Testing...' : 'Test'}
                  </button>
                )}
              </div>
            </div>
            {testResult && testResult.provider === p.name && (
              <div className={`mt-3 px-3 py-2 rounded-lg text-sm ${testResult.valid ? 'bg-emerald-600/20 text-emerald-400' : 'bg-red-600/20 text-red-400'}`}>
                {testResult.valid ? '✓ API key is valid' : `✗ ${testResult.error || 'Invalid API key'}`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
