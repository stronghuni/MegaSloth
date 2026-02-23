import React, { useEffect, useState } from 'react';

interface Stats {
  repositories: number;
  totalEvents: number;
  completedEvents: number;
  failedEvents: number;
  totalTokensUsed: number;
}

interface HealthData {
  status: string;
  services: { redis: string; database: string };
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [events, setEvents] = useState<Array<{ id: number; eventType: string; status: string; createdAt: string }>>([]);

  useEffect(() => {
    const load = async () => {
      const [s, h, e] = await Promise.all([
        window.megasloth?.fetchApi('/api/stats'),
        window.megasloth?.fetchApi('/health'),
        window.megasloth?.fetchApi('/api/events?limit=10'),
      ]);
      if (s) setStats(s as Stats);
      if (h) setHealth(h as HealthData);
      if (e && (e as { events: [] }).events) setEvents((e as { events: typeof events }).events);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Repositories" value={stats?.repositories ?? '—'} icon="📁" />
        <StatCard label="Total Events" value={stats?.totalEvents ?? '—'} icon="⚡" />
        <StatCard label="Success Rate" value={stats ? `${stats.totalEvents > 0 ? Math.round((stats.completedEvents / stats.totalEvents) * 100) : 0}%` : '—'} icon="✅" />
        <StatCard label="Tokens Used" value={stats?.totalTokensUsed ? `${(stats.totalTokensUsed / 1000).toFixed(1)}k` : '—'} icon="🔤" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Service Health</h3>
          <div className="space-y-3">
            <ServiceRow name="HTTP API" status={health ? 'healthy' : 'unhealthy'} />
            <ServiceRow name="Redis" status={health?.services?.redis ?? 'unknown'} />
            <ServiceRow name="Database" status={health?.services?.database ?? 'unknown'} />
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Recent Events</h3>
          {events.length > 0 ? (
            <div className="space-y-2">
              {events.slice(0, 5).map(e => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`status-dot ${e.status === 'completed' ? 'bg-emerald-400' : e.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                    <span className="text-sm text-slate-300">{e.eventType}</span>
                  </div>
                  <span className="text-xs text-slate-500">{new Date(e.createdAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No events yet. Start the agent to begin monitoring.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="card-hover">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function ServiceRow({ name, status }: { name: string; status: string }) {
  const isHealthy = status === 'healthy';
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-300">{name}</span>
      <span className={`text-xs px-2 py-1 rounded-full ${isHealthy ? 'bg-emerald-600/20 text-emerald-400' : 'bg-red-600/20 text-red-400'}`}>
        {status}
      </span>
    </div>
  );
}
