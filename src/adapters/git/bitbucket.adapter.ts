import BitbucketModule from 'bitbucket';
const { Bitbucket } = BitbucketModule;
import { createHmac, timingSafeEqual } from 'node:crypto';
import { type BitbucketConfig } from '../../config/schema.js';
import { getLogger } from '../../utils/logger.js';
import type {
  GitProviderAdapter,
  GitRepository,
  GitBranch,
  GitPullRequest,
  GitPullRequestFile,
  GitCommit,
  GitComment,
  GitReview,
  GitIssue,
  GitWorkflowRun,
  GitJob,
  GitRelease,
  GitUser,
  CreatePRReviewInput,
  CreateIssueInput,
  CreateReleaseInput,
  BranchComparison,
} from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BitbucketAPI = any;

export class BitbucketAdapter implements GitProviderAdapter {
  readonly provider = 'bitbucket' as const;
  private api: BitbucketAPI;
  private logger = getLogger('bitbucket-adapter');
  private webhookSecret?: string;

  constructor(config: BitbucketConfig) {
    this.api = new Bitbucket({
      auth: {
        username: config.username!,
        password: config.appPassword!,
      },
    });
    this.webhookSecret = config.webhookSecret;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapUser(user: any): GitUser {
    return {
      id: user?.uuid || user?.account_id || '0',
      username: user?.nickname || user?.display_name || 'unknown',
      avatarUrl: user?.links?.avatar?.href,
    };
  }

  // Repository operations
  async getRepository(owner: string, name: string): Promise<GitRepository> {
    const { data } = await this.api.repositories.get({
      workspace: owner,
      repo_slug: name,
    });

    return {
      id: data.uuid || '',
      name: data.name || name,
      fullName: data.full_name || `${owner}/${name}`,
      owner,
      description: data.description || undefined,
      defaultBranch: data.mainbranch?.name || 'main',
      isPrivate: data.is_private || false,
      url: data.links?.html?.href || '',
      cloneUrl: data.links?.clone?.find((c: { name: string }) => c.name === 'https')?.href || '',
    };
  }

  async listBranches(owner: string, repo: string): Promise<GitBranch[]> {
    const { data } = await this.api.repositories.listBranches({
      workspace: owner,
      repo_slug: repo,
    });

    const repoData = await this.getRepository(owner, repo);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.values || []).map((branch: any) => ({
      name: branch.name || '',
      sha: branch.target?.hash || '',
      isDefault: branch.name === repoData.defaultBranch,
      isProtected: false,
    }));
  }

  async deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
    await this.api.refs.deleteBranch({
      workspace: owner,
      repo_slug: repo,
      name: branch,
    });
  }

  async compareBranches(owner: string, repo: string, base: string, head: string): Promise<BranchComparison> {
    const { data } = await this.api.repositories.listDiffStats({
      workspace: owner,
      repo_slug: repo,
      spec: `${base}..${head}`,
    });

    return {
      ahead: 0,
      behind: 0,
      commits: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      files: (data.values || []).map((stat: any) => ({
        filename: stat.new?.path || stat.old?.path || '',
        status: this.mapDiffStatus(stat.status || ''),
        additions: stat.lines_added || 0,
        deletions: stat.lines_removed || 0,
      })),
    };
  }

  private mapDiffStatus(status: string): 'added' | 'modified' | 'removed' | 'renamed' {
    switch (status) {
      case 'added': return 'added';
      case 'removed': return 'removed';
      case 'renamed': return 'renamed';
      default: return 'modified';
    }
  }

  // Pull Request operations
  async listPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitPullRequest[]> {
    const stateMap: Record<string, string> = {
      open: 'OPEN',
      closed: 'MERGED,DECLINED,SUPERSEDED',
      all: 'OPEN,MERGED,DECLINED,SUPERSEDED',
    };

    const { data } = await this.api.repositories.listPullRequests({
      workspace: owner,
      repo_slug: repo,
      state: stateMap[state],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.values || []).map((pr: any) => ({
      id: String(pr.id),
      number: pr.id || 0,
      title: pr.title || '',
      description: pr.description || undefined,
      state: this.mapPRState(pr.state || ''),
      author: this.mapUser(pr.author || {}),
      sourceBranch: pr.source?.branch?.name || '',
      targetBranch: pr.destination?.branch?.name || '',
      url: pr.links?.html?.href || '',
      isDraft: false,
      createdAt: new Date(pr.created_on || Date.now()),
      updatedAt: new Date(pr.updated_on || Date.now()),
    }));
  }

  private mapPRState(state: string): 'open' | 'closed' | 'merged' {
    switch (state.toUpperCase()) {
      case 'OPEN': return 'open';
      case 'MERGED': return 'merged';
      default: return 'closed';
    }
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<GitPullRequest> {
    const { data: pr } = await this.api.repositories.getPullRequest({
      workspace: owner,
      repo_slug: repo,
      pull_request_id: number,
    });

    return {
      id: String(pr.id),
      number: pr.id || 0,
      title: pr.title || '',
      description: pr.description || undefined,
      state: this.mapPRState(pr.state || ''),
      author: this.mapUser(pr.author || {}),
      sourceBranch: pr.source?.branch?.name || '',
      targetBranch: pr.destination?.branch?.name || '',
      url: pr.links?.html?.href || '',
      isDraft: false,
      createdAt: new Date(pr.created_on || Date.now()),
      updatedAt: new Date(pr.updated_on || Date.now()),
    };
  }

  async getPullRequestFiles(owner: string, repo: string, number: number): Promise<GitPullRequestFile[]> {
    const { data } = await this.api.repositories.getPullRequestDiffStat({
      workspace: owner,
      repo_slug: repo,
      pull_request_id: number,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.values || []).map((stat: any) => ({
      filename: stat.new?.path || stat.old?.path || '',
      status: this.mapDiffStatus(stat.status || ''),
      additions: stat.lines_added || 0,
      deletions: stat.lines_removed || 0,
    }));
  }

  async getPullRequestCommits(owner: string, repo: string, number: number): Promise<GitCommit[]> {
    const { data } = await this.api.repositories.listPullRequestCommits({
      workspace: owner,
      repo_slug: repo,
      pull_request_id: number,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.values || []).map((commit: any) => ({
      sha: commit.hash || '',
      message: commit.message || '',
      author: this.mapUser(commit.author?.user || {}),
      date: new Date(commit.date || Date.now()),
      url: commit.links?.html?.href || '',
    }));
  }

  async createPRReview(owner: string, repo: string, number: number, review: CreatePRReviewInput): Promise<GitReview> {
    if (review.event === 'APPROVE') {
      await this.api.repositories.createPullRequestApproval({
        workspace: owner,
        repo_slug: repo,
        pull_request_id: number,
      });
    } else if (review.body) {
      await this.api.repositories.createPullRequestComment({
        workspace: owner,
        repo_slug: repo,
        pull_request_id: number,
        _body: {
          content: {
            raw: review.body,
          },
        },
      });
    }

    // Add line comments
    if (review.comments) {
      for (const comment of review.comments) {
        await this.api.repositories.createPullRequestComment({
          workspace: owner,
          repo_slug: repo,
          pull_request_id: number,
          _body: {
            content: {
              raw: comment.body,
            },
            inline: {
              path: comment.path,
              to: comment.line,
            },
          },
        });
      }
    }

    return {
      id: '0',
      state: review.event === 'APPROVE' ? 'approved' : 'commented',
      body: review.body,
      author: { id: '0', username: 'self' },
      createdAt: new Date(),
    };
  }

  async approvePR(owner: string, repo: string, number: number, body?: string): Promise<GitReview> {
    return this.createPRReview(owner, repo, number, { event: 'APPROVE', body });
  }

  async requestChanges(owner: string, repo: string, number: number, body: string): Promise<GitReview> {
    return this.createPRReview(owner, repo, number, { event: 'COMMENT', body: `Changes Requested:\n\n${body}` });
  }

  async addPRComment(owner: string, repo: string, number: number, body: string): Promise<GitComment> {
    const { data } = await this.api.repositories.createPullRequestComment({
      workspace: owner,
      repo_slug: repo,
      pull_request_id: number,
      _body: {
        content: {
          raw: body,
        },
      },
    });

    return {
      id: String(data.id),
      body,
      author: this.mapUser(data.user || {}),
      createdAt: new Date(data.created_on || Date.now()),
      updatedAt: new Date(data.updated_on || Date.now()),
    };
  }

  async addLineComment(owner: string, repo: string, number: number, path: string, line: number, body: string): Promise<GitComment> {
    const { data } = await this.api.repositories.createPullRequestComment({
      workspace: owner,
      repo_slug: repo,
      pull_request_id: number,
      _body: {
        content: {
          raw: body,
        },
        inline: {
          path,
          to: line,
        },
      },
    });

    return {
      id: String(data.id),
      body,
      author: this.mapUser(data.user || {}),
      createdAt: new Date(data.created_on || Date.now()),
      updatedAt: new Date(data.updated_on || Date.now()),
      path,
      line,
    };
  }

  async getPRComments(owner: string, repo: string, number: number): Promise<GitComment[]> {
    const { data } = await this.api.repositories.listPullRequestComments({
      workspace: owner,
      repo_slug: repo,
      pull_request_id: number,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.values || []).map((comment: any) => ({
      id: String(comment.id),
      body: comment.content?.raw || '',
      author: this.mapUser(comment.user || {}),
      createdAt: new Date(comment.created_on || Date.now()),
      updatedAt: new Date(comment.updated_on || Date.now()),
      path: comment.inline?.path,
      line: comment.inline?.to,
    }));
  }

  async getPRReviews(owner: string, repo: string, number: number): Promise<GitReview[]> {
    const { data: pr } = await this.api.repositories.getPullRequest({
      workspace: owner,
      repo_slug: repo,
      pull_request_id: number,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (pr.participants || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => p.approved)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => ({
        id: p.user?.uuid || '0',
        state: 'approved' as const,
        author: this.mapUser(p.user || {}),
        createdAt: new Date(),
      }));
  }

  async mergePR(owner: string, repo: string, number: number, commitTitle?: string, mergeMethod?: 'merge' | 'squash' | 'rebase'): Promise<void> {
    const strategyMap: Record<string, string> = {
      merge: 'merge_commit',
      squash: 'squash',
      rebase: 'fast_forward',
    };

    await this.api.repositories.mergePullRequest({
      workspace: owner,
      repo_slug: repo,
      pull_request_id: number,
      _body: {
        message: commitTitle,
        merge_strategy: strategyMap[mergeMethod || 'merge'],
      },
    });
  }

  // Issue operations
  async listIssues(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitIssue[]> {
    const { data } = await this.api.repositories.listIssues({
      workspace: owner,
      repo_slug: repo,
    });

    return (data.values || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((issue: any) => {
        if (state === 'all') return true;
        if (state === 'open') return issue.state === 'new' || issue.state === 'open';
        return issue.state === 'closed' || issue.state === 'resolved';
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((issue: any) => ({
        id: String(issue.id),
        number: issue.id || 0,
        title: issue.title || '',
        body: issue.content?.raw || undefined,
        state: (issue.state === 'new' || issue.state === 'open') ? 'open' : 'closed' as const,
        author: this.mapUser(issue.reporter || {}),
        labels: [],
        assignees: issue.assignee ? [this.mapUser(issue.assignee)] : [],
        url: issue.links?.html?.href || '',
        createdAt: new Date(issue.created_on || Date.now()),
        updatedAt: new Date(issue.updated_on || Date.now()),
      }));
  }

  async getIssue(owner: string, repo: string, number: number): Promise<GitIssue> {
    const { data: issue } = await this.api.repositories.getIssue({
      workspace: owner,
      repo_slug: repo,
      issue_id: String(number),
    });

    return {
      id: String(issue.id),
      number: issue.id || 0,
      title: issue.title || '',
      body: issue.content?.raw || undefined,
      state: (issue.state === 'new' || issue.state === 'open') ? 'open' : 'closed',
      author: this.mapUser(issue.reporter || {}),
      labels: [],
      assignees: issue.assignee ? [this.mapUser(issue.assignee)] : [],
      url: issue.links?.html?.href || '',
      createdAt: new Date(issue.created_on || Date.now()),
      updatedAt: new Date(issue.updated_on || Date.now()),
    };
  }

  async createIssue(owner: string, repo: string, issue: CreateIssueInput): Promise<GitIssue> {
    const { data } = await this.api.repositories.createIssue({
      workspace: owner,
      repo_slug: repo,
      _body: {
        title: issue.title,
        content: {
          raw: issue.body || '',
        },
      },
    });

    return {
      id: String(data.id),
      number: data.id || 0,
      title: data.title || '',
      body: data.content?.raw || undefined,
      state: 'open',
      author: this.mapUser(data.reporter || {}),
      labels: [],
      assignees: [],
      url: data.links?.html?.href || '',
      createdAt: new Date(data.created_on || Date.now()),
      updatedAt: new Date(data.updated_on || Date.now()),
    };
  }

  async updateIssue(owner: string, repo: string, number: number, update: Partial<CreateIssueInput>): Promise<GitIssue> {
    const { data } = await this.api.repositories.updateIssue({
      workspace: owner,
      repo_slug: repo,
      issue_id: String(number),
      _body: {
        title: update.title,
        content: update.body ? { raw: update.body } : undefined,
      },
    });

    return {
      id: String(data.id),
      number: data.id || 0,
      title: data.title || '',
      body: data.content?.raw || undefined,
      state: (data.state === 'new' || data.state === 'open') ? 'open' : 'closed',
      author: this.mapUser(data.reporter || {}),
      labels: [],
      assignees: data.assignee ? [this.mapUser(data.assignee)] : [],
      url: data.links?.html?.href || '',
      createdAt: new Date(data.created_on || Date.now()),
      updatedAt: new Date(data.updated_on || Date.now()),
    };
  }

  async closeIssue(owner: string, repo: string, number: number): Promise<GitIssue> {
    const { data } = await this.api.repositories.updateIssue({
      workspace: owner,
      repo_slug: repo,
      issue_id: String(number),
      _body: { state: 'closed' },
    });
    return {
      id: String(data.id),
      number: data.id || 0,
      title: data.title || '',
      body: data.content?.raw || undefined,
      state: 'closed',
      author: this.mapUser(data.reporter || {}),
      labels: [],
      assignees: data.assignee ? [this.mapUser(data.assignee)] : [],
      url: data.links?.html?.href || '',
      createdAt: new Date(data.created_on || Date.now()),
      updatedAt: new Date(data.updated_on || Date.now()),
    };
  }

  async addIssueComment(owner: string, repo: string, number: number, body: string): Promise<GitComment> {
    const { data } = await this.api.repositories.createIssueComment({
      workspace: owner,
      repo_slug: repo,
      issue_id: String(number),
      _body: {
        content: {
          raw: body,
        },
      },
    });

    return {
      id: String(data.id),
      body,
      author: this.mapUser(data.user || {}),
      createdAt: new Date(data.created_on || Date.now()),
      updatedAt: new Date(data.updated_on || Date.now()),
    };
  }

  // CI/CD operations (Bitbucket Pipelines)
  async getWorkflowRuns(owner: string, repo: string, branch?: string): Promise<GitWorkflowRun[]> {
    const { data } = await this.api.repositories.listPipelines({
      workspace: owner,
      repo_slug: repo,
    });

    return (data.values || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => !branch || p.target?.ref_name === branch)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((pipeline: any) => ({
        id: pipeline.uuid || '',
        name: `Pipeline ${pipeline.build_number}`,
        status: this.mapPipelineStatus(pipeline.state?.name || ''),
        conclusion: this.mapPipelineConclusion(pipeline.state?.result?.name),
        url: pipeline.links?.self?.href || '',
        branch: pipeline.target?.ref_name || '',
        sha: pipeline.target?.commit?.hash || '',
        createdAt: new Date(pipeline.created_on || Date.now()),
        updatedAt: new Date(pipeline.completed_on || pipeline.created_on || Date.now()),
      }));
  }

  private mapPipelineStatus(status: string): 'queued' | 'in_progress' | 'completed' {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return 'queued';
      case 'IN_PROGRESS':
        return 'in_progress';
      default:
        return 'completed';
    }
  }

  private mapPipelineConclusion(result?: string): 'success' | 'failure' | 'cancelled' | 'skipped' | undefined {
    if (!result) return undefined;
    switch (result.toUpperCase()) {
      case 'SUCCESSFUL': return 'success';
      case 'FAILED': return 'failure';
      case 'STOPPED': return 'cancelled';
      default: return undefined;
    }
  }

  async getWorkflowRun(owner: string, repo: string, runId: string): Promise<GitWorkflowRun> {
    const { data: pipeline } = await this.api.repositories.getPipeline({
      workspace: owner,
      repo_slug: repo,
      pipeline_uuid: runId,
    });

    return {
      id: pipeline.uuid || '',
      name: `Pipeline ${pipeline.build_number}`,
      status: this.mapPipelineStatus(pipeline.state?.name || ''),
      conclusion: this.mapPipelineConclusion(pipeline.state?.result?.name),
      url: pipeline.links?.self?.href || '',
      branch: pipeline.target?.ref_name || '',
      sha: pipeline.target?.commit?.hash || '',
      createdAt: new Date(pipeline.created_on || Date.now()),
      updatedAt: new Date(pipeline.completed_on || pipeline.created_on || Date.now()),
    };
  }

  async getWorkflowJobs(owner: string, repo: string, runId: string): Promise<GitJob[]> {
    const { data } = await this.api.repositories.listPipelineSteps({
      workspace: owner,
      repo_slug: repo,
      pipeline_uuid: runId,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.values || []).map((step: any) => ({
      id: step.uuid || '',
      name: step.name || 'Unknown',
      status: this.mapPipelineStatus(step.state?.name || ''),
      conclusion: this.mapPipelineConclusion(step.state?.result?.name) as 'success' | 'failure' | 'cancelled' | 'skipped' | undefined,
      startedAt: step.started_on ? new Date(step.started_on) : undefined,
      completedAt: step.completed_on ? new Date(step.completed_on) : undefined,
    }));
  }

  async getJobLogs(_owner: string, _repo: string, _jobId: string): Promise<string> {
    this.logger.warn('getJobLogs requires pipeline UUID in addition to step UUID');
    return 'Log retrieval requires additional context';
  }

  async retryWorkflow(_owner: string, _repo: string, _runId: string): Promise<void> {
    this.logger.warn('Bitbucket does not support re-running pipelines');
  }

  async cancelWorkflow(owner: string, repo: string, runId: string): Promise<void> {
    await this.api.repositories.stopPipeline({
      workspace: owner,
      repo_slug: repo,
      pipeline_uuid: runId,
    });
  }

  // Release operations (using tags)
  async listReleases(owner: string, repo: string): Promise<GitRelease[]> {
    const { data } = await this.api.repositories.listTags({
      workspace: owner,
      repo_slug: repo,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.values || []).map((tag: any) => ({
      id: tag.name || '',
      tagName: tag.name || '',
      name: tag.name || '',
      body: tag.message || undefined,
      isDraft: false,
      isPrerelease: false,
      url: tag.links?.html?.href || '',
      createdAt: new Date(tag.date || Date.now()),
      author: tag.tagger ? {
        id: '0',
        username: tag.tagger.raw || 'unknown',
      } : { id: '0', username: 'unknown' },
    }));
  }

  async createRelease(owner: string, repo: string, release: CreateReleaseInput): Promise<GitRelease> {
    const { data } = await this.api.repositories.createTag({
      workspace: owner,
      repo_slug: repo,
      _body: {
        name: release.tagName,
        target: {
          hash: release.targetCommitish || 'HEAD',
        },
        message: release.body,
      },
    });

    return {
      id: data.name || '',
      tagName: data.name || '',
      name: release.name || data.name || '',
      body: data.message || undefined,
      isDraft: false,
      isPrerelease: false,
      url: data.links?.html?.href || '',
      createdAt: new Date(data.date || Date.now()),
      author: { id: '0', username: 'unknown' },
    };
  }

  // File operations
  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    const { data } = await this.api.repositories.readSrc({
      workspace: owner,
      repo_slug: repo,
      commit: ref || 'HEAD',
      path,
    });

    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  async listFiles(owner: string, repo: string, path = '', ref?: string): Promise<string[]> {
    const { data } = await this.api.repositories.readSrcRoot({
      workspace: owner,
      repo_slug: repo,
      commit: ref || 'HEAD',
      path,
    });

    if ('values' in data && Array.isArray(data.values)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.values.map((item: any) => item.path || '');
    }

    return [];
  }

  // File write operations
  async createOrUpdateFile(owner: string, repo: string, input: import('./types.js').CreateFileInput): Promise<void> {
    await (this.api as any).repositories.createSrcFileCommit({ workspace: owner, repo_slug: repo, message: input.message, [input.path]: input.content });
  }

  async deleteFile(_owner: string, _repo: string, _path: string, _message: string): Promise<void> {
    throw new Error('Bitbucket file deletion via API not directly supported');
  }

  async searchCode(owner: string, repo: string, query: string): Promise<import('./types.js').CodeSearchResult[]> {
    const { data } = await (this.api as any).repositories.listSrc({ workspace: owner, repo_slug: repo, q: query });
    return ((data as any)?.values || []).map((v: any) => ({ path: String(v.path || ''), matches: [] }));
  }

  async createBranch(owner: string, repo: string, branchName: string, fromRef: string): Promise<import('./types.js').GitBranch> {
    await (this.api as any).repositories.createBranch({ workspace: owner, repo_slug: repo, _body: { name: branchName, target: { hash: fromRef } } });
    return { name: branchName, sha: fromRef, isDefault: false, isProtected: false };
  }

  async createPullRequest(owner: string, repo: string, input: import('./types.js').CreatePullRequestInput): Promise<import('./types.js').GitPullRequest> {
    const { data } = await (this.api as any).repositories.createPullRequest({
      workspace: owner, repo_slug: repo,
      _body: { title: input.title, source: { branch: { name: input.head } }, destination: { branch: { name: input.base } }, description: input.body },
    });
    const pr = data as any;
    return {
      id: String(pr.id), number: pr.id, title: input.title, description: input.body,
      state: 'open', sourceBranch: input.head, targetBranch: input.base,
      author: { id: String(pr.author?.uuid || ''), username: String(pr.author?.display_name || '') },
      url: String(pr.links?.html?.href || ''), isDraft: false, createdAt: new Date(), updatedAt: new Date(),
    };
  }

  async listWorkflows(_owner: string, _repo: string): Promise<import('./types.js').GitWorkflow[]> {
    return [{ id: 'default', name: 'Bitbucket Pipelines', path: 'bitbucket-pipelines.yml', state: 'active' }];
  }

  async getWorkflowConfig(owner: string, repo: string, _workflowId: string): Promise<string> {
    return this.getFileContent(owner, repo, 'bitbucket-pipelines.yml');
  }

  async triggerWorkflow(owner: string, repo: string, _workflowId: string, ref: string, inputs?: Record<string, string>): Promise<import('./types.js').GitWorkflowRun> {
    const { data } = await (this.api as any).pipelines.createPipeline({ workspace: owner, repo_slug: repo, _body: { target: { type: 'pipeline_ref_target', ref_type: 'branch', ref_name: ref }, variables: inputs ? Object.entries(inputs).map(([key, value]) => ({ key, value })) : undefined } });
    const p = data as any;
    return { id: String(p.uuid || Date.now()), name: 'Pipeline', status: 'queued', branch: ref, sha: '', url: '', createdAt: new Date(), updatedAt: new Date() };
  }

  async listEnvironments(owner: string, repo: string): Promise<import('./types.js').GitEnvironment[]> {
    const { data } = await (this.api as any).repositories.listEnvironments({ workspace: owner, repo_slug: repo });
    return ((data as any)?.values || []).map((e: any) => ({ id: String(e.uuid), name: String(e.name) }));
  }

  async getEnvironmentVariables(owner: string, _repo: string, _envName: string): Promise<import('./types.js').GitVariable[]> {
    const { data } = await (this.api as any).pipelines.listVariablesForWorkspace({ workspace: owner });
    return ((data as any)?.values || []).map((v: any) => ({ name: String(v.key), value: String(v.value || ''), isSecret: v.secured || false }));
  }

  async setEnvironmentVariable(owner: string, _repo: string, _envName: string, name: string, value: string, isSecret = false): Promise<void> {
    await (this.api as any).pipelines.createVariableForWorkspace({ workspace: owner, _body: { key: name, value, secured: isSecret } });
  }

  async deleteEnvironmentVariable(owner: string, _repo: string, _envName: string, name: string): Promise<void> {
    await (this.api as any).pipelines.deleteVariableForWorkspace({ workspace: owner, variable_uuid: name });
  }

  async getRepositoryVariables(owner: string, repo: string): Promise<import('./types.js').GitVariable[]> {
    return this.getEnvironmentVariables(owner, repo, '');
  }

  async setRepositoryVariable(owner: string, repo: string, name: string, value: string, isSecret = false): Promise<void> {
    return this.setEnvironmentVariable(owner, repo, '', name, value, isSecret);
  }

  async deleteRepositoryVariable(owner: string, repo: string, name: string): Promise<void> {
    return this.deleteEnvironmentVariable(owner, repo, '', name);
  }

  async listDeployments(_owner: string, _repo: string, _environment?: string): Promise<import('./types.js').GitDeployment[]> {
    return [];
  }

  async createDeployment(_owner: string, _repo: string, ref: string, environment: string, _description?: string): Promise<import('./types.js').GitDeployment> {
    return { id: String(Date.now()), environment, status: 'pending', sha: ref, createdAt: new Date() };
  }

  async updateDeploymentStatus(_owner: string, _repo: string, _deploymentId: string, _state: 'success' | 'failure' | 'in_progress'): Promise<void> {
    // Bitbucket deployment statuses managed through pipeline
  }

  // Webhook verification
  verifyWebhookSignature(payload: string | Buffer, signature: string, secret: string): boolean {
    try {
      const payloadStr = typeof payload === 'string' ? payload : payload.toString();
      const expected = createHmac('sha256', secret).update(payloadStr).digest('hex');
      return timingSafeEqual(
        Buffer.from(signature.replace('sha256=', '')),
        Buffer.from(expected)
      );
    } catch {
      return false;
    }
  }
}
