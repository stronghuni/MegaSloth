import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Chat } from './pages/Chat';
import { Dashboard } from './pages/Dashboard';
import { Repositories } from './pages/Repositories';
import { Skills } from './pages/Skills';
import { Providers } from './pages/Providers';
import { Logs } from './pages/Logs';
import { Settings } from './pages/Settings';

export type Page = 'chat' | 'dashboard' | 'repositories' | 'skills' | 'providers' | 'logs' | 'settings';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('chat');

  const renderPage = () => {
    switch (currentPage) {
      case 'chat': return <Chat />;
      case 'dashboard': return <Dashboard />;
      case 'repositories': return <Repositories />;
      case 'skills': return <Skills />;
      case 'providers': return <Providers />;
      case 'logs': return <Logs />;
      case 'settings': return <Settings />;
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0e17]">
      <div className="drag-region fixed top-0 left-0 right-0 z-50" />
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 overflow-y-auto pt-[38px]">
        <div className="animate-fade-in h-full">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
