import React, { useEffect, useState } from 'react';
import type { Page } from '../App';

declare global {
  interface Window {
    megasloth: {
      getCoreStatus: () => Promise<{ running: boolean }>;
      startCore: () => Promise<{ running: boolean }>;
      stopCore: () => Promise<{ running: boolean }>;
      getVersion: () => Promise<string>;
      fetchApi: (endpoint: string, options?: { method?: string; body?: unknown }) => Promise<unknown>;
      onCoreStatus: (cb: (status: { running: boolean }) => void) => void;
      onCoreLog: (cb: (log: string) => void) => void;
    };
  }
}

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const NAV_ITEMS: Array<{ id: Page; label: string; icon: string }> = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'repositories', label: 'Repos', icon: '📁' },
  { id: 'skills', label: 'Skills', icon: '🧠' },
  { id: 'providers', label: 'Providers', icon: '🤖' },
  { id: 'logs', label: 'Logs', icon: '📜' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [version, setVersion] = useState('1.0.0');

  useEffect(() => {
    window.megasloth?.getCoreStatus().then(s => setIsRunning(s.running));
    window.megasloth?.onCoreStatus(s => setIsRunning(s.running));
    window.megasloth?.getVersion().then(v => setVersion(v));
  }, []);

  const toggleAgent = async () => {
    if (isRunning) {
      await window.megasloth?.stopCore();
    } else {
      await window.megasloth?.startCore();
    }
  };

  return (
    <aside className="w-[220px] bg-[#080c14] border-r border-slate-800/50 flex flex-col pt-[38px]">
      <div className="px-5 py-4 border-b border-slate-800/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-700/10 border border-emerald-500/20 flex items-center justify-center shadow-lg shadow-emerald-500/10">
            <span className="text-lg">🦥</span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-white tracking-tight">MegaSloth</h1>
            <p className="text-[10px] text-emerald-500/60 uppercase tracking-[0.2em]">slow is smooth</p>
          </div>
        </div>
      </div>

      <div className="px-3 py-3">
        <button
          onClick={toggleAgent}
          className={`no-drag w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200 ${
            isRunning
              ? 'bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/15'
              : 'bg-slate-800/40 border border-slate-700/40 hover:bg-slate-800/60'
          }`}
        >
          <span className={isRunning ? 'status-dot-running' : 'status-dot-stopped'} />
          <div className="text-left">
            <div className="text-xs font-medium">{isRunning ? 'Running' : 'Stopped'}</div>
            <div className="text-[10px] text-slate-500">{isRunning ? 'Click to stop' : 'Click to start'}</div>
          </div>
        </button>
      </div>

      <nav className="flex-1 px-2 py-1 space-y-0.5">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`no-drag w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-150 ${
              currentPage === item.id
                ? 'bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/15'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <span className="text-sm">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-slate-800/40">
        <p className="text-[10px] text-slate-600 text-center tracking-wide">v{version}</p>
      </div>
    </aside>
  );
}
