import React, { useEffect, useState } from 'react';

interface Repository {
  id: number;
  provider: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

export function Repositories() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ provider: 'github', owner: '', name: '' });

  useEffect(() => {
    loadRepos();
  }, []);

  const loadRepos = async () => {
    const data = await window.megasloth?.fetchApi('/api/repositories') as { repositories: Repository[] } | null;
    if (data?.repositories) setRepos(data.repositories);
  };

  const addRepo = async () => {
    if (!form.owner || !form.name) return;
    await window.megasloth?.fetchApi('/api/repositories', {
      method: 'POST',
      body: form,
    });
    setShowAdd(false);
    setForm({ provider: 'github', owner: '', name: '' });
    loadRepos();
  };

  const providerIcons: Record<string, string> = { github: '🐙', gitlab: '🦊', bitbucket: '🪣' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Repositories</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">+ Add Repository</button>
      </div>

      {showAdd && (
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold">Add Repository</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Platform</label>
              <select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm">
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
                <option value="bitbucket">Bitbucket</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Owner</label>
              <input value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} placeholder="username or org" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Repository</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="repo-name" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addRepo} className="btn-primary">Add</button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {repos.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-4xl mb-4">📁</p>
          <p className="text-slate-400">No repositories configured yet</p>
          <p className="text-sm text-slate-500 mt-1">Add a repository to start monitoring</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {repos.map(repo => (
            <div key={repo.id} className="card-hover">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{providerIcons[repo.provider] || '📁'}</span>
                <div>
                  <h3 className="font-semibold text-white">{repo.fullName}</h3>
                  <p className="text-xs text-slate-400 capitalize">{repo.provider} &middot; {repo.defaultBranch}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
