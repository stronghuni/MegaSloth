import React, { useEffect, useState } from 'react';

declare global {
  interface Window {
    megasloth: {
      getCoreStatus: () => Promise<{ running: boolean }>;
      startCore: () => Promise<{ running: boolean }>;
      stopCore: () => Promise<{ running: boolean }>;
      getVersion: () => Promise<string>;
      fetchApi: (endpoint: string) => Promise<unknown>;
      onCoreStatus: (cb: (status: { running: boolean }) => void) => void;
      onCoreLog: (cb: (log: string) => void) => void;
    };
  }
}

type Page = 'dashboard' | 'repositories' | 'skills' | 'providers' | 'logs' | 'settings';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const NAV_ITEMS: Array<{ id: Page; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'repositories', label: 'Repositories', icon: '📁' },
  { id: 'skills', label: 'Skills', icon: '🧠' },
  { id: 'providers', label: 'AI Providers', icon: '🤖' },
  { id: 'logs', label: 'Logs', icon: '📜' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    window.megasloth?.getCoreStatus().then(s => setIsRunning(s.running));
    window.megasloth?.onCoreStatus(s => setIsRunning(s.running));
  }, []);

  const toggleAgent = async () => {
    if (isRunning) {
      await window.megasloth?.stopCore();
    } else {
      await window.megasloth?.startCore();
    }
  };

  return (
    <aside className="w-64 bg-slate-950/80 border-r border-slate-800 flex flex-col pt-[38px]">
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🦥</span>
          <div>
            <h1 className="text-lg font-bold text-white">MegaSloth</h1>
            <p className="text-xs text-slate-400">Repository Agent</p>
          </div>
        </div>
      </div>

      <div className="p-3">
        <button
          onClick={toggleAgent}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
            isRunning
              ? 'bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30'
              : 'bg-slate-800 border border-slate-700 hover:bg-slate-700'
          }`}
        >
          <span className={isRunning ? 'status-dot-running' : 'status-dot-stopped'} />
          <div className="text-left">
            <div className="text-sm font-medium">{isRunning ? 'Running' : 'Stopped'}</div>
            <div className="text-xs text-slate-400">{isRunning ? 'Click to stop' : 'Click to start'}</div>
          </div>
        </button>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`no-drag w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
              currentPage === item.id
                ? 'bg-slate-800 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <p className="text-xs text-slate-500 text-center">v1.0.0</p>
      </div>
    </aside>
  );
}
