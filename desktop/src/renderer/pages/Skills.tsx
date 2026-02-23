import React, { useEffect, useState } from 'react';

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

  const toggleSkill = async (name: string, enabled: boolean) => {
    await fetch(`http://localhost:13000/api/skills/${name}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setSkills(prev => prev.map(s => s.name === name ? { ...s, enabled: !s.enabled } : s));
  };

  const triggerIcon = (type: string) => type === 'webhook' ? '🔗' : type === 'cron' ? '⏰' : '📌';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Skills</h2>
        <span className="text-sm text-slate-400">{skills.length} skills loaded</span>
      </div>

      <div className="space-y-3">
        {skills.map(skill => (
          <div key={skill.name} className="card-hover">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => toggleSkill(skill.name, skill.enabled)}
                  className={`w-12 h-6 rounded-full transition-colors duration-200 relative ${skill.enabled ? 'bg-emerald-600' : 'bg-slate-600'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${skill.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{skill.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${skill.type === 'builtin' ? 'bg-blue-600/20 text-blue-400' : 'bg-purple-600/20 text-purple-400'}`}>
                      {skill.type}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">{skill.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {skill.triggers.map((t, i) => (
                  <span key={i} className="text-xs bg-slate-700 px-2 py-1 rounded-md" title={t.events?.join(', ') || t.schedule}>
                    {triggerIcon(t.type)} {t.type}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}

        {skills.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-4xl mb-4">🧠</p>
            <p className="text-slate-400">No skills loaded</p>
            <p className="text-sm text-slate-500 mt-1">Start the agent to load built-in skills</p>
          </div>
        )}
      </div>
    </div>
  );
}
