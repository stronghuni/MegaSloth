import React, { useEffect, useRef, useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolsUsed?: string[];
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'system',
      content: '🦥 MegaSloth is awake. Slow is smooth, smooth is fast. Ask me anything — I can execute commands, manage repos, browse the web, and automate workflows.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const port = 13000;

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const checkConnection = async () => {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      setIsConnected(res.ok);
    } catch {
      setIsConnected(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(`http://localhost:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (res.ok) {
        const data = await res.json() as any;
        const assistantMsg: Message = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: data.response || data.message || JSON.stringify(data),
          timestamp: new Date(),
          toolsUsed: data.toolsUsed,
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: 'system',
          content: `Error: ${res.status} ${res.statusText}`,
          timestamp: new Date(),
        }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'system',
        content: isConnected ? `Connection error: ${err.message}` : 'Agent is not running. Start it first.',
        timestamp: new Date(),
      }]);
    }

    setIsLoading(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const hasUserMessages = messages.some(m => m.role !== 'system');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {!hasUserMessages && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in select-none">
            <div className="sloth-hero mb-6">
              <pre className="text-emerald-500/70 text-xs leading-tight font-mono text-center">{`
      ___            ___
     (o o)  ___  (o o)
      \\ /  / M \\  \\ /
    ──(()──(()──(()──
       │  \\_/  │
       └───┬───┘
              `}</pre>
            </div>
            <h2 className="text-xl font-semibold text-white mb-1">MegaSloth</h2>
            <p className="text-sm text-slate-500 mb-6 italic">Slow is smooth, smooth is fast.</p>
            <div className="grid grid-cols-2 gap-2 max-w-md w-full">
              {[
                { icon: '⚡', label: 'Execute commands', desc: 'Shell, scripts, builds' },
                { icon: '🌐', label: 'Browse the web', desc: 'Fetch, search, automate' },
                { icon: '📂', label: 'Manage files', desc: 'Read, write, search' },
                { icon: '🔧', label: 'Git & CI/CD', desc: 'Repos, PRs, deploys' },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={() => setInput(item.label.toLowerCase())}
                  className="text-left p-3 rounded-xl bg-slate-800/30 border border-slate-700/30 hover:bg-slate-800/50 hover:border-emerald-500/20 transition-all group"
                >
                  <span className="text-lg">{item.icon}</span>
                  <p className="text-xs font-medium text-slate-300 mt-1 group-hover:text-emerald-400 transition-colors">{item.label}</p>
                  <p className="text-[10px] text-slate-600">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {hasUserMessages && messages.map(msg => (
          <div key={msg.id} className={`animate-fade-in ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
            {msg.role === 'system' ? (
              <div className="text-center py-2">
                <div className="inline-block bg-slate-800/40 border border-slate-700/30 rounded-full px-4 py-1.5">
                  <span className="text-[11px] text-slate-500">{msg.content}</span>
                </div>
              </div>
            ) : msg.role === 'user' ? (
              <div className="chat-bubble-user">
                <p className="text-sm text-emerald-100 whitespace-pre-wrap">{msg.content}</p>
                <p className="text-[10px] text-emerald-500/40 mt-1.5 text-right">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ) : (
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs">🦥</span>
                </div>
                <div className="chat-bubble-ai flex-1">
                  <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {msg.toolsUsed.map((tool, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 bg-slate-700/50 rounded text-slate-400">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-600 mt-1.5">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 items-start animate-fade-in">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 sloth-breathe">
              <span className="text-xs">🦥</span>
            </div>
            <div className="chat-bubble-ai">
              <div className="flex gap-1.5 py-1 items-center">
                <span className="text-[11px] text-slate-500 italic mr-1">thinking slowly...</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.4s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1.4s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1.4s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-800/40 bg-[#0a0e17]/80 backdrop-blur-md px-6 py-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isConnected ? 'Ask MegaSloth anything...' : 'Agent not running — start it to chat'}
              rows={1}
              disabled={!isConnected}
              className="input-field resize-none pr-12"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full transition-all ${isConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-red-400'}`}
                title={isConnected ? 'Connected' : 'Disconnected'} />
            </div>
          </div>
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading || !isConnected}
            className="btn-primary px-4 py-3 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-slate-600 mt-2 text-center">
          🦥 84 tools · Slow is smooth, smooth is fast
        </p>
      </div>
    </div>
  );
}
