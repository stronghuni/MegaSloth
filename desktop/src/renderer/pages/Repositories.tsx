import React, { useEffect, useState } from 'react';
import {
  GitBranch,
  RefreshCw,
  ExternalLink,
  Lock,
  Globe,
  Loader2,
  AlertTriangle,
  Github,
} from 'lucide-react';

interface RepoInfo {
  provider: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  url: string;
  private: boolean;
  description: string;
  language: string;
  updatedAt: string;
}

interface FetchResult {
  repos: RepoInfo[];
  errors: Array<{ provider: string; error: string }>;
}

const PROVIDER_LABELS: Record<string, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

const PROVIDER_BADGE: Record<string, string> = {
  github: 'bg-slate-500/15 text-slate-300',
  gitlab: 'bg-orange-500/15 text-orange-400',
  bitbucket: 'bg-blue-500/15 text-blue-400',
};

const LANG_COLORS: Record<string, string> = {
  TypeScript: 'bg-blue-400',
  JavaScript: 'bg-yellow-400',
  Python: 'bg-green-400',
  Go: 'bg-cyan-400',
  Rust: 'bg-orange-400',
  Java: 'bg-red-400',
  Ruby: 'bg-red-500',
  'C#': 'bg-purple-400',
  PHP: 'bg-indigo-400',
  Swift: 'bg-orange-500',
  Kotlin: 'bg-purple-500',
  Vue: 'bg-emerald-400',
  HTML: 'bg-orange-300',
  CSS: 'bg-blue-300',
  Shell: 'bg-green-500',
  Dart: 'bg-teal-400',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function Repositories() {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [errors, setErrors] = useState<Array<{ provider: string; error: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadRepos();
  }, []);

  const loadRepos = async () => {
    setLoading(true);
    setErrors([]);
    try {
      const result = await window.megasloth?.fetchRepositories() as FetchResult | null;
      if (result) {
        setRepos(result.repos || []);
        setErrors(result.errors || []);
      }
    } catch {
      setErrors([{ provider: 'system', error: 'Failed to fetch repositories' }]);
    }
    setLoading(false);
  };

  const providers = [...new Set(repos.map(r => r.provider))];

  const filtered = repos.filter(r => {
    if (filter !== 'all' && r.provider !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.fullName.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
    }
    return true;
  });

  const counts: Record<string, number> = { all: repos.length };
  for (const r of repos) counts[r.provider] = (counts[r.provider] || 0) + 1;

  return (
    <div className="space-y-4 sm:space-y-6 px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold heading-primary">Repositories</h2>
          <p className="text-xs sm:text-sm heading-secondary mt-0.5">
            {loading ? 'Scanning...' : `${repos.length} repositories discovered`}
          </p>
        </div>
        <button
          onClick={loadRepos}
          disabled={loading}
          className="btn-secondary flex items-center gap-1.5 text-sm shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {errors.length > 0 && (
        <div className="space-y-1.5">
          {errors.map((err, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600/10 border border-red-500/20 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {err.provider !== 'none' && err.provider !== 'system' && (
                <span className="font-medium">{PROVIDER_LABELS[err.provider] || err.provider}:</span>
              )}
              <span>{err.error}</span>
            </div>
          ))}
        </div>
      )}

      {loading && repos.length === 0 ? (
        <div className="card text-center py-16">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Discovering repositories from configured platforms...</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>GitHub, GitLab, Bitbucket</p>
        </div>
      ) : repos.length === 0 && !loading ? (
        <div className="card text-center py-16">
          <GitBranch className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>No repositories found</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Configure Git platform tokens in Settings to discover repos
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  filter === 'all' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : ''
                }`}
                style={filter !== 'all' ? { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' } : undefined}
              >
                All ({counts.all})
              </button>
              {providers.map(p => (
                <button
                  key={p}
                  onClick={() => setFilter(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    filter === p ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : ''
                  }`}
                  style={filter !== p ? { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' } : undefined}
                >
                  {PROVIDER_LABELS[p] || p} ({counts[p] || 0})
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search repos..."
              className="input-field text-sm sm:max-w-[240px] !py-1.5"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {filtered.map(repo => (
              <div key={`${repo.provider}-${repo.fullName}`} className="card-hover group">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                    <GitBranch className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm heading-primary truncate">{repo.fullName}</span>
                      {repo.private ? (
                        <Lock className="w-3 h-3 shrink-0" style={{ color: 'var(--text-muted)' }} />
                      ) : (
                        <Globe className="w-3 h-3 shrink-0" style={{ color: 'var(--text-muted)' }} />
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{repo.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${PROVIDER_BADGE[repo.provider] || ''}`}>
                        {PROVIDER_LABELS[repo.provider] || repo.provider}
                      </span>
                      {repo.language && (
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          <span className={`w-2 h-2 rounded-full ${LANG_COLORS[repo.language] || 'bg-slate-400'}`} />
                          {repo.language}
                        </span>
                      )}
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {repo.defaultBranch}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {timeAgo(repo.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <a
                    href={repo.url}
                    onClick={e => { e.preventDefault(); window.open(repo.url, '_blank'); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md shrink-0"
                    style={{ color: 'var(--text-muted)' }}
                    title="Open in browser"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && repos.length > 0 && (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No repos match your search</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
