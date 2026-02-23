import React, { useEffect, useRef, useState } from 'react';

export function Logs() {
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.megasloth?.onCoreLog((log: string) => {
      setLogs(prev => {
        const newLogs = [...prev, log];
        if (newLogs.length > 500) newLogs.splice(0, newLogs.length - 500);
        return newLogs;
      });
    });
  }, []);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const clearLogs = () => setLogs([]);

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Logs</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="rounded border-slate-600"
            />
            Auto-scroll
          </label>
          <button onClick={clearLogs} className="btn-secondary text-sm">Clear</button>
        </div>
      </div>

      <div
        ref={logRef}
        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-y-auto font-mono text-xs leading-relaxed min-h-[400px]"
      >
        {logs.length === 0 ? (
          <p className="text-slate-600">No logs yet. Start the agent to see output.</p>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="py-0.5 hover:bg-slate-900/50">
              <span className="text-slate-600 select-none mr-3">{String(i + 1).padStart(4)}</span>
              <span className={getLogColor(line)}>{line}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function getLogColor(line: string): string {
  if (line.includes('ERROR') || line.includes('error')) return 'text-red-400';
  if (line.includes('WARN') || line.includes('warn')) return 'text-yellow-400';
  if (line.includes('INFO') || line.includes('info')) return 'text-slate-300';
  if (line.includes('DEBUG') || line.includes('debug')) return 'text-slate-500';
  return 'text-slate-400';
}
