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
    <div className="space-y-6 px-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">Overview of your automation agent</p>
        </div>
        <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${
          health ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${health ? 'bg-emerald-400' : 'bg-red-400'}`} />
          {health ? 'Healthy' : 'Offline'}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Repositories" value={stats?.repositories ?? '—'} color="emerald" />
        <StatCard label="Events" value={stats?.totalEvents ?? '—'} color="blue" />
        <StatCard
          label="Success"
          value={stats ? `${stats.totalEvents > 0 ? Math.round((stats.completedEvents / stats.totalEvents) * 100) : 0}%` : '—'}
          color="green"
        />
        <StatCard
          label="Tokens"
          value={stats?.totalTokensUsed ? `${(stats.totalTokensUsed / 1000).toFixed(1)}k` : '—'}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Services</h3>
          <div className="space-y-2.5">
            <ServiceRow name="HTTP API" ok={!!health} detail={health ? ':13000' : 'offline'} />
            <ServiceRow name="Redis" ok={health?.services?.redis === 'healthy'} detail={health?.services?.redis ?? 'unknown'} />
            <ServiceRow name="Database" ok={health?.services?.database === 'healthy'} detail={health?.services?.database ?? 'unknown'} />
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Recent Events</h3>
          {events.length > 0 ? (
            <div className="space-y-1.5">
              {events.slice(0, 6).map(e => (
                <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-slate-800/30 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      e.status === 'completed' ? 'bg-emerald-400' : e.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
                    }`} />
                    <span className="text-xs text-slate-300">{e.eventType}</span>
                  </div>
                  <span className="text-[10px] text-slate-600">{new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-600 text-xs">No events yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'border-emerald-500/15 text-emerald-400',
    blue: 'border-blue-500/15 text-blue-400',
    green: 'border-green-500/15 text-green-400',
    purple: 'border-purple-500/15 text-purple-400',
  };

  return (
    <div className={`card border ${colorMap[color] || ''}`}>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-[11px] text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function ServiceRow({ name, ok, detail }: { name: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{name}</span>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
        <span className={`text-[11px] ${ok ? 'text-slate-400' : 'text-red-400'}`}>{detail}</span>
      </div>
    </div>
  );
}
