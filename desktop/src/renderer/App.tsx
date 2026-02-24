import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Onboarding } from './pages/Onboarding';
import { Chat } from './pages/Chat';
import { Repositories } from './pages/Repositories';
import { Settings } from './pages/Settings';

export type Page = 'chat' | 'repositories' | 'settings';

const COLLAPSE_THRESHOLD = 960;

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseUrl: string;
  downloadUrl: string;
  releaseNotes: string;
}

export function App() {
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < COLLAPSE_THRESHOLD);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

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

  useEffect(() => {
    const unsub = window.megasloth?.onUpdateAvailable((info: UpdateInfo) => {
      setUpdateInfo(info);
    });
    return () => unsub?.();
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
      case 'repositories': return <Repositories />;
      case 'settings': return <Settings />;
    }
  };

  const handleDismissUpdate = () => {
    window.megasloth?.dismissUpdate();
    setUpdateInfo(null);
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
        {updateInfo && (
          <div className="mx-3 sm:mx-4 md:mx-6 mt-3 px-4 py-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex items-center gap-3 animate-fade-in">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                새 버전 사용 가능: <span className="text-emerald-400">{updateInfo.releaseName}</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                현재 v{updateInfo.currentVersion} → v{updateInfo.latestVersion}
              </p>
            </div>
            <a
              href={updateInfo.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-primary text-xs !px-3 !py-1.5 shrink-0"
            >
              다운로드
            </a>
            <button
              onClick={handleDismissUpdate}
              className="text-xs shrink-0 px-2 py-1 rounded transition-colors hover:bg-white/5"
              style={{ color: 'var(--text-muted)' }}
            >
              닫기
            </button>
          </div>
        )}
        <div className="animate-fade-in h-full">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
