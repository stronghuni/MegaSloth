import React, { useEffect, useState } from 'react';

interface AppConfig {
  server?: { httpPort: number; webhookPort: number; websocketPort: number };
  llm?: { provider: string; model?: string; maxTokens?: number };
  github?: { configured: boolean };
  gitlab?: { configured: boolean };
  bitbucket?: { configured: boolean };
  slack?: { configured: boolean };
  logging?: { level: string; pretty: boolean };
}

export function Settings() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const data = await window.megasloth?.fetchApi('/api/config') as { config: AppConfig } | null;
    if (data?.config) setConfig(data.config);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      {config ? (
        <div className="space-y-6">
          <Section title="Server" icon="🌐">
            <Row label="HTTP Port" value={config.server?.httpPort ?? 13000} />
            <Row label="Webhook Port" value={config.server?.webhookPort ?? 3001} />
            <Row label="WebSocket Port" value={config.server?.websocketPort ?? 18789} />
          </Section>

          <Section title="LLM Provider" icon="🤖">
            <Row label="Provider" value={config.llm?.provider ?? 'Not set'} />
            <Row label="Model" value={config.llm?.model ?? 'Default'} />
            <Row label="Max Tokens" value={config.llm?.maxTokens ?? 4096} />
          </Section>

          <Section title="Git Platforms" icon="📦">
            <StatusRow label="GitHub" configured={config.github?.configured ?? false} />
            <StatusRow label="GitLab" configured={config.gitlab?.configured ?? false} />
            <StatusRow label="Bitbucket" configured={config.bitbucket?.configured ?? false} />
          </Section>

          <Section title="Notifications" icon="🔔">
            <StatusRow label="Slack" configured={config.slack?.configured ?? false} />
          </Section>

          <Section title="Logging" icon="📝">
            <Row label="Level" value={config.logging?.level ?? 'info'} />
            <Row label="Pretty Print" value={config.logging?.pretty ? 'Enabled' : 'Disabled'} />
          </Section>

          <div className="card">
            <p className="text-sm text-slate-400">
              To edit configuration, use the terminal: <code className="bg-slate-700 px-2 py-0.5 rounded text-emerald-400">megasloth config</code>
            </p>
          </div>
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-slate-400">Could not load configuration. Make sure the agent is running.</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm text-white font-mono">{value}</span>
    </div>
  );
}

function StatusRow({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm ${configured ? 'text-emerald-400' : 'text-slate-500'}`}>
        {configured ? '✓ Configured' : '✗ Not configured'}
      </span>
    </div>
  );
}
