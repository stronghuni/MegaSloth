import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Onboarding } from './pages/Onboarding';
import { Chat } from './pages/Chat';
import { Dashboard } from './pages/Dashboard';
import { Repositories } from './pages/Repositories';
import { Logs } from './pages/Logs';
import { Settings } from './pages/Settings';

export type Page = 'chat' | 'dashboard' | 'repositories' | 'logs' | 'settings';

const COLLAPSE_THRESHOLD = 960;

export function App() {
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < COLLAPSE_THRESHOLD);

  const handleResize = useCallback(() => {
    setSidebarCollapsed(window.innerWidth < COLLAPSE_THRESHOLD);
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  useEffect(() => {
    window.megasloth?.isOnboarded()
      .then((v: boolean) => setIsOnboarded(v))
      .catch(() => setIsOnboarded(false));
  }, []);

  useEffect(() => {
    window.megasloth?.getTheme().then((t: string) => {
      document.documentElement.setAttribute('data-theme', t || 'dark');
    });
  }, []);

  if (isOnboarded === null) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <div className="animate-pulse text-emerald-500/40 text-sm font-mono tracking-wider">
          MegaSloth
        </div>
      </div>
    );
  }

  if (!isOnboarded) {
    return <Onboarding onComplete={() => setIsOnboarded(true)} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'chat': return <Chat />;
      case 'dashboard': return <Dashboard />;
      case 'repositories': return <Repositories />;
      case 'logs': return <Logs />;
      case 'settings': return <Settings />;
    }
  };

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg-app)' }}>
      <div className="drag-region fixed top-0 left-0 right-0 z-50" />
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(p => !p)}
      />
      <main className="flex-1 overflow-y-auto pt-[38px] min-w-0">
        <div className="animate-fade-in h-full">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
