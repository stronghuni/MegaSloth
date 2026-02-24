import React, { useEffect, useState } from 'react';
import { Wrench, Webhook, Clock } from 'lucide-react';

interface Skill {
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  type: string;
  triggers: Array<{ type: string; events?: string[]; schedule?: string }>;
}

export function Skills() {
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    const data = await window.megasloth?.fetchApi('/api/skills') as { skills: Skill[] } | null;
    if (data?.skills) setSkills(data.skills);
  };

  const TriggerIcon = ({ type }: { type: string }) => {
    if (type === 'webhook') return <Webhook className="w-3 h-3" />;
    if (type === 'cron') return <Clock className="w-3 h-3" />;
    return <Wrench className="w-3 h-3" />;
  };

  return (
    <div className="space-y-6 px-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Agent Skills</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Autonomous capabilities managed by the agent
          </p>
        </div>
        <span className="text-xs text-slate-500">{skills.length} skills loaded</span>
      </div>

      <div className="space-y-3">
        {skills.map(skill => (
          <div key={skill.name} className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Wrench className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-white text-sm">{skill.name}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      skill.type === 'builtin'
                        ? 'bg-blue-600/15 text-blue-400'
                        : 'bg-purple-600/15 text-purple-400'
                    }`}>
                      {skill.type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{skill.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {skill.triggers.map((t, i) => (
                  <span
                    key={i}
                    className="text-[10px] bg-slate-800/60 px-2 py-1 rounded flex items-center gap-1 text-slate-400"
                    title={t.events?.join(', ') || t.schedule}
                  >
                    <TriggerIcon type={t.type} />
                    {t.type}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}

        {skills.length === 0 && (
          <div className="card text-center py-12">
            <Wrench className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No skills loaded</p>
            <p className="text-sm text-slate-500 mt-1">Start the agent to load built-in skills</p>
          </div>
        )}
      </div>
    </div>
  );
}
