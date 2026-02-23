export * from './types.js';
export { GitHubAdapter } from './github.adapter.js';
export { GitLabAdapter } from './gitlab.adapter.js';
export { BitbucketAdapter } from './bitbucket.adapter.js';

import { type GitProviderAdapter, type GitProvider } from './types.js';
import { GitHubAdapter } from './github.adapter.js';
import { GitLabAdapter } from './gitlab.adapter.js';
import { BitbucketAdapter } from './bitbucket.adapter.js';
import { type GitHubConfig, type GitLabConfig, type BitbucketConfig } from '../../config/schema.js';

export interface GitAdapterConfigs {
  github?: GitHubConfig;
  gitlab?: GitLabConfig;
  bitbucket?: BitbucketConfig;
}

export class GitAdapterFactory {
  private adapters: Map<GitProvider, GitProviderAdapter> = new Map();

  constructor(configs: GitAdapterConfigs) {
    if (configs.github?.token) {
      this.adapters.set('github', new GitHubAdapter(configs.github));
    }
    if (configs.gitlab?.token) {
      this.adapters.set('gitlab', new GitLabAdapter(configs.gitlab));
    }
    if (configs.bitbucket?.username && configs.bitbucket?.appPassword) {
      this.adapters.set('bitbucket', new BitbucketAdapter(configs.bitbucket));
    }
  }

  get(provider: GitProvider): GitProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  getOrThrow(provider: GitProvider): GitProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No adapter configured for provider: ${provider}`);
    }
    return adapter;
  }

  has(provider: GitProvider): boolean {
    return this.adapters.has(provider);
  }

  listProviders(): GitProvider[] {
    return Array.from(this.adapters.keys());
  }
}
