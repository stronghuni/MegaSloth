import React, { useEffect, useRef, useState } from 'react';
import { ScrollText, Trash2, ArrowDownToLine } from 'lucide-react';

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
    <div className="space-y-4 h-full flex flex-col px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-white">Logs</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Agent output stream</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`btn-ghost flex items-center gap-1 sm:gap-1.5 text-xs ${autoScroll ? 'text-emerald-400' : ''}`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Auto-scroll</span>
          </button>
          <button onClick={clearLogs} className="btn-ghost flex items-center gap-1 sm:gap-1.5 text-xs">
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>

      <div
        ref={logRef}
        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-2 sm:p-4 overflow-x-auto overflow-y-auto font-mono text-[10px] sm:text-xs leading-relaxed min-h-[300px] sm:min-h-[400px]"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <ScrollText className="w-6 h-6 mb-2" />
            <p>No logs yet. Start the agent to see output.</p>
          </div>
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
