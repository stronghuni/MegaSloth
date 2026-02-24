import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Send, Trash2, AlertCircle, Bot, User, Square, Terminal, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

const SLOTH_ART = `\
############################################################################################################################################
############################################################################################################################################
############################################# -. -         -*###############################################################################
#########################################* .--: -=-=======+**+ .*###########################################################################
########################################+ :=:. -==============+*+ +#########################################################################
######################################* -===============+###+===+*-.########################################################################
#####################################:.=============*##########+==*:-#######################################################################
####################################=.====+##############*:  -*#*==* +######################################################################
#########################*  :*#####* -===###############*:=-:  =*==** +#####################################################################
#########################****+- .-#= -==##*:.-:.##+=====* #+*--=====+*+ ..-*################################################################
########################**********=: -==#*-.:  :.=      =*#**==========+++***-:  -=#########################################################
#######################****.  +*****.:-=++= =** #==-. ===-==#*==================+***:  +*###################################################
######################*********=  .+* :-======##==.:..:.-==+#=========================**+- :*###############################################
#####################***************:  .--====+#+=======+*#*==============================+*+: =############################################
####################********************- ---====######*=====================================+**- =#########################################
###################*++********************+-  .:-----===========================================+**:.#######################################
##################--+++++++*******************++- .--- :===========================================**- *####################################
####################+  :+++++++********************: : ==========- ==================================**: ###################################
########################*- .-+++++++********: .=***** ==========: ----------===========================** =#################################
#############################=. :=++++++********=. -= =========- ------------------=====================+*.=################################
##################################-  :+++++++*******:.=========.:+=:    ---------------==================+* *###############################
######################################+: .-+++++++*+:.========- ******+++=-  .--------------==============*-=###############################
#########################################:::  :=++==.-========.  -+*********++=: .------------. ==========+.+###############################
########################################* --====:  : ========- ****:  =**********++. :------: ============= ################################
########################################:.------- +# ========:.+*******=. ******-.=**+-. :- :============:.#################################
########################################-.------.=## -======- =+++++***************-. -+*+ -===========-   +*###############################
########################################-.-----:.### --====-- .  -+++++++***************: ===========  =+++**  .*###########################
########################################-.-----::####::------: ####=. .=+++++++**********-.=====-.  :=++++********-  -*######################
########################################=.----::####:.------ *#########-  -=++++++****** -=====- :  -+****************.  +*#################
#########################################:.--: #####-.------ ##############*:  =+++++++-.-====- +++**+:  =****************+ .###############
#########################################* + + ###### ------ ##############*:  =+++++++-.-====- +++**+:  =****************+ .###############
##########################################*. :.######+ ----: ###################=. :=++:.----: +++********=. :+************#################
######################################################* ---  ###################### :.   ---: ==+*************************##################
########################################################.-. =.#####################+   =     .==+++++***** .*************###################
#########################################################*:.*#######################=. .  = -:-  :=++++++****- +-********###################
##########################################################################################==######*.  ==++++++****. .+**####################
#######################################################################################################*  .++++++++****#####################
###########################################################################################################*-  :=+++++######################
################################################################################################################*.  =#######################
############################################################################################################################################
############################################################################################################################################`;

interface ToolExecution {
  tool: string;
  args: string;
  output?: string;
  state: 'running' | 'done' | 'error';
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  provider?: string;
  toolCalls?: ToolExecution[];
}

function ToolCallDisplay({ calls, collapsed: initCollapsed }: { calls: ToolExecution[]; collapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initCollapsed ?? false);
  if (!calls.length) return null;

  const toolIcon: Record<string, string> = {
    execute_command: '⚡',
    read_file: '📄',
    write_file: '✏️',
    list_directory: '📁',
    search_files: '🔍',
  };

  return (
    <div className="mb-3">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-1.5 text-xs font-medium py-1 px-2 rounded-md transition-colors"
        style={{ color: 'var(--text-muted)', background: 'var(--bg-card)' }}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <Terminal className="w-3 h-3" />
        <span>{calls.length} tool call{calls.length > 1 ? 's' : ''}</span>
      </button>
      {!collapsed && (
        <div className="mt-1.5 space-y-1.5 pl-2 border-l-2" style={{ borderColor: 'var(--border)' }}>
          {calls.map((tc, i) => (
            <div key={i} className="text-xs rounded-lg p-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1.5 font-medium" style={{ color: tc.state === 'error' ? '#ef4444' : tc.state === 'running' ? '#f59e0b' : '#10b981' }}>
                <span>{toolIcon[tc.tool] || '🔧'}</span>
                <span>{tc.tool}</span>
                {tc.state === 'running' && <span className="animate-pulse">...</span>}
              </div>
              <div className="mt-0.5 font-mono opacity-70 truncate" style={{ color: 'var(--text-muted)' }}>{tc.args}</div>
              {tc.output && (
                <pre className="mt-1 text-[10px] leading-tight overflow-x-auto max-h-24 overflow-y-auto rounded p-1.5"
                  style={{ background: 'var(--code-bg)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {tc.output}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [chatReady, setChatReady] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingTextRef = useRef('');
  const toolExecutionsRef = useRef<ToolExecution[]>([]);
  const doneProcessedRef = useRef(false);

  useEffect(() => {
    checkChatStatus();
    loadHistory();
  }, []);

  useEffect(() => {
    const unChunk = window.megasloth?.onChatChunk((chunk: string) => {
      streamingTextRef.current += chunk;
      setStreamingText(streamingTextRef.current);
    });

    const unDone = window.megasloth?.onChatDone((data: { provider: string }) => {
      if (doneProcessedRef.current) return;
      doneProcessedRef.current = true;

      const finalText = streamingTextRef.current;
      const finalTools = [...toolExecutionsRef.current];
      streamingTextRef.current = '';
      toolExecutionsRef.current = [];

      setStreamingText('');
      setToolExecutions([]);
      setIsStreaming(false);

      if (finalText) {
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: finalText,
          timestamp: Date.now(),
          provider: data.provider,
          toolCalls: finalTools.length ? finalTools : undefined,
        }]);
      }
    });

    const unErr = window.megasloth?.onChatError((error: string) => {
      streamingTextRef.current = '';
      toolExecutionsRef.current = [];
      setStreamingText('');
      setToolExecutions([]);
      setIsStreaming(false);
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'system',
        content: error,
        timestamp: Date.now(),
      }]);
    });

    const unTool = window.megasloth?.onChatToolStatus?.((status: ToolExecution) => {
      toolExecutionsRef.current = toolExecutionsRef.current.some(
        t => t.tool === status.tool && t.args === status.args && t.state === 'running'
      )
        ? toolExecutionsRef.current.map(t =>
            t.tool === status.tool && t.args === status.args && t.state === 'running' ? status : t
          )
        : [...toolExecutionsRef.current, status];

      setToolExecutions([...toolExecutionsRef.current]);
    });

    return () => { unChunk?.(); unDone?.(); unErr?.(); unTool?.(); };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, toolExecutions]);

  const checkChatStatus = async () => {
    try {
      const status = await window.megasloth?.getChatStatus();
      setChatReady(status?.ready ?? false);
      setActiveProvider(status?.provider ?? null);
    } catch { setChatReady(false); }
  };

  const loadHistory = async () => {
    try {
      const history = await window.megasloth?.loadChatHistory();
      if (history?.length) {
        setMessages(history.map((m: { role: string; content: string; timestamp?: number }, i: number) => ({
          id: `hist-${i}`,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          timestamp: m.timestamp || Date.now(),
        })));
      }
    } catch {}
    setHistoryLoaded(true);
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    doneProcessedRef.current = false;
    streamingTextRef.current = '';
    toolExecutionsRef.current = [];

    const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');
    setToolExecutions([]);

    const result = await window.megasloth?.chatStream(text);
    if (result?.error) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'system', content: result.error!, timestamp: Date.now() }]);
      setIsStreaming(false);
      if (result.error.includes('API key')) setChatReady(false);
    }
  }, [input, isStreaming]);

  const handleClear = async () => {
    await window.megasloth?.clearChat();
    setMessages([]);
    setStreamingText('');
    setToolExecutions([]);
    streamingTextRef.current = '';
    toolExecutionsRef.current = [];
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const hasMessages = messages.length > 0 || isStreaming;

  if (!historyLoaded) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in select-none px-4">
            <div className="sloth-hero mb-4 flex justify-center sloth-logo-welcome">
              <pre className="text-emerald-500/30 font-mono select-none whitespace-pre sloth-art-glow">
                {SLOTH_ART}
              </pre>
            </div>
            <h2 className="text-xl font-semibold heading-primary mb-1">MegaSloth</h2>
            <p className="text-emerald-500/60 text-xs font-semibold tracking-[0.3em] uppercase mb-1">Rules Every Repos</p>
            <p className="text-sm heading-secondary mb-8">One agent. Total control. Zero effort.</p>
            {!chatReady && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 mb-6">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  No API key configured. Go to <strong>Settings</strong> to add one.
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 max-w-md w-full">
              {['Show my git status', 'Review recent commits', 'List project structure', 'Check CI/CD pipeline'].map((q, i) => (
                <button key={i} onClick={() => chatReady && setInput(q)}
                  className={`text-left p-3 rounded-xl transition-all text-sm ${chatReady ? 'chat-suggestion' : 'opacity-40 cursor-not-allowed'}`}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map(msg => (
              <div key={msg.id} className="animate-fade-in">
                {msg.role === 'system' ? (
                  <div className="text-center py-2">
                    <span className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      {msg.content}
                    </span>
                  </div>
                ) : msg.role === 'user' ? (
                  <div className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                      <User className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>You</p>
                      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{msg.content}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div className="flex-1 pt-0.5 min-w-0">
                      <p className="text-sm font-medium text-emerald-400/70 mb-1">MegaSloth{msg.provider ? ` · ${msg.provider}` : ''}</p>
                      {msg.toolCalls && <ToolCallDisplay calls={msg.toolCalls} collapsed />}
                      <div className="chat-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isStreaming && (
              <div className="flex gap-3 items-start animate-fade-in">
                <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5 sloth-breathe">
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="flex-1 pt-0.5 min-w-0">
                  <p className="text-sm font-medium text-emerald-400/70 mb-1">MegaSloth</p>
                  {toolExecutions.length > 0 && <ToolCallDisplay calls={toolExecutions} />}
                  {streamingText ? (
                    <div className="chat-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {streamingText + '▍'}
                      </ReactMarkdown>
                    </div>
                  ) : !toolExecutions.some(t => t.state === 'running') ? (
                    <div className="flex gap-1.5 py-2 items-center">
                      <div className="w-2 h-2 rounded-full bg-emerald-400/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-emerald-400/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-emerald-400/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : null}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-app)' }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 rounded-xl p-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            {hasMessages && (
              <button onClick={handleClear} className="p-2 rounded-lg transition-colors shrink-0" style={{ color: 'var(--text-muted)' }}
                title="Clear chat">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => { setInput(e.target.value); autoResize(e.target); }}
              onKeyDown={handleKeyDown}
              placeholder={chatReady ? 'Message MegaSloth...' : 'Configure an API key in Settings...'}
              rows={1}
              disabled={!chatReady || isStreaming}
              className="flex-1 resize-none bg-transparent border-none outline-none text-sm py-2 px-1"
              style={{ color: 'var(--text-primary)', minHeight: '24px', maxHeight: '200px' }}
            />
            <div className="flex items-center gap-2 shrink-0">
              {activeProvider && (
                <span className="text-[10px] uppercase tracking-wide hidden sm:block" style={{ color: 'var(--text-muted)' }}>{activeProvider}</span>
              )}
              {isStreaming ? (
                <button className="p-2 rounded-lg bg-red-500/20 text-red-400" title="Stop">
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={sendMessage} disabled={!input.trim() || !chatReady}
                  className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-white">
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
