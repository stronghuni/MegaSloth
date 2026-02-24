import React, { useEffect, useRef, useState } from 'react';
import { Send, Zap, Globe, FolderOpen, GitBranch, Bot, Container } from 'lucide-react';

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
      content: 'MegaSloth is ready. Just tell me what you need — I will plan, execute, and deliver.',
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
        const data = await res.json() as { response?: string; message?: string; toolsUsed?: string[] };
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'system',
        content: isConnected ? `Connection error: ${errorMessage}` : 'Agent is starting up. Please wait a moment.',
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

  const QUICK_ACTIONS = [
    { Icon: Zap, label: 'Execute commands', desc: 'Shell, scripts, builds' },
    { Icon: Globe, label: 'Browse the web', desc: 'Fetch, search, automate' },
    { Icon: FolderOpen, label: 'Manage files', desc: 'Read, write, search' },
    { Icon: GitBranch, label: 'Git & CI/CD', desc: 'Repos, PRs, deploys' },
    { Icon: Container, label: 'K8s & Jenkins', desc: 'Clusters, pipelines' },
  ];

  return (
    <div className="flex flex-col h-full">

      <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 py-4 space-y-4">
        {!hasUserMessages && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in select-none">
            <div className="sloth-hero mb-4 flex justify-center sloth-logo-welcome">
              <pre className="text-emerald-500/30 font-mono select-none whitespace-pre sloth-art-glow">
                {SLOTH_ART}
              </pre>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold heading-primary mb-1 tracking-tight">MegaSloth</h2>
            <p className="text-emerald-500/60 text-xs font-semibold tracking-[0.3em] uppercase mb-1">
              Rules Every Repos
            </p>
            <p className="text-xs sm:text-sm text-slate-500 mb-6 sm:mb-8">
              One agent. Total control. Zero effort.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-lg w-full px-2">
              {QUICK_ACTIONS.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setInput(item.label.toLowerCase())}
                  className="text-left p-2.5 sm:p-3 rounded-xl border hover:border-emerald-500/20 transition-all group card-hover"
                >
                  <item.Icon className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500/40 group-hover:text-emerald-400 transition-colors" />
                  <p className="text-[11px] sm:text-xs font-medium mt-1.5 sm:mt-2 group-hover:text-emerald-400 transition-colors heading-secondary">
                    {item.label}
                  </p>
                  <p className="text-[10px] text-slate-600 hidden sm:block">{item.desc}</p>
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
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="chat-bubble-ai flex-1">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-primary)' }}>{msg.content}</p>
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
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="chat-bubble-ai">
              <div className="flex gap-1.5 py-1 items-center">
                <span className="text-[11px] text-slate-500 italic mr-1">planning & executing...</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.4s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1.4s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1.4s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="backdrop-blur-md px-3 sm:px-4 md:px-6 py-3 sm:py-4" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-app)' }}>
        <div className="flex items-end gap-2 sm:gap-3">
          <div className="flex-1 relative min-w-0">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isConnected ? 'Tell MegaSloth what to do...' : 'Connecting to agent...'}
              rows={1}
              disabled={!isConnected}
              className="input-field resize-none pr-12 text-sm"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full transition-all ${
                  isConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-red-400'
                }`}
                title={isConnected ? 'Connected' : 'Disconnected'}
              />
            </div>
          </div>
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading || !isConnected}
            className="btn-primary px-3 sm:px-4 py-3 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-slate-600 mt-2 text-center hidden sm:block">
          105 tools at your command. Jenkins, K8s, Helm, and more. Just ask.
        </p>
      </div>
    </div>
  );
}
