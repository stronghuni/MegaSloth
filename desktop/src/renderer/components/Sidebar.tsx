import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  LayoutDashboard,
  GitBranch,
  ScrollText,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
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
      isOnboarded: () => Promise<boolean>;
      completeOnboarding: () => Promise<boolean>;
      validateApiKey: (config: { provider: string; apiKey: string }) => Promise<{ valid: boolean; error?: string }>;
      saveApiConfig: (config: { provider: string; apiKey: string }) => Promise<boolean>;
      getLocalConfig: () => Promise<unknown>;
      testProvider: (provider: string) => Promise<{ valid: boolean; error?: string }>;
      getTheme: () => Promise<string>;
      setTheme: (theme: string) => Promise<boolean>;
      fetchRepositories: () => Promise<unknown>;
    };
  }
}

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS: Array<{ id: Page; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'repositories', label: 'Repos', Icon: GitBranch },
  { id: 'logs', label: 'Logs', Icon: ScrollText },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export function Sidebar({ currentPage, onNavigate, collapsed, onToggle }: SidebarProps) {
  const [version, setVersion] = useState('1.0.0');

  useEffect(() => {
    window.megasloth?.getVersion().then(v => setVersion(v));
  }, []);

  return (
    <aside
      className={`border-r flex flex-col pt-[38px] transition-all duration-200 shrink-0 ${
        collapsed ? 'w-[60px]' : 'w-[220px]'
      }`}
      style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-subtle)' }}
    >
      <nav className={`flex-1 py-3 space-y-0.5 ${collapsed ? 'px-1.5' : 'px-2'}`}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            title={collapsed ? item.label : undefined}
            className={`no-drag w-full flex items-center rounded-lg transition-all duration-150 ${
              collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2 text-[13px]'
            } ${
              currentPage === item.id
                ? 'bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/15'
                : 'nav-item-inactive'
            }`}
          >
            <item.Icon className={collapsed ? 'w-5 h-5' : 'w-4 h-4'} />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className={`${collapsed ? 'px-1.5 py-2' : 'px-3 py-2'}`} style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="no-drag w-full flex items-center justify-center py-1.5 rounded-lg transition-all nav-item-inactive"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
        {!collapsed && (
          <p className="text-[10px] text-center tracking-wide mt-1" style={{ color: 'var(--text-muted)' }}>v{version}</p>
        )}
      </div>
    </aside>
  );
}
