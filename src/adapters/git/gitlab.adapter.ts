import { Gitlab } from '@gitbeaker/rest';
import { type GitLabConfig } from '../../config/schema.js';
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
type GitLabAPI = any;

export class GitLabAdapter implements GitProviderAdapter {
  readonly provider = 'gitlab' as const;
  private api: GitLabAPI;
  private logger = getLogger('gitlab-adapter');
  private webhookSecret?: string;

  constructor(config: GitLabConfig) {
    this.api = new Gitlab({
      token: config.token!,
      host: config.url,
    });
    this.webhookSecret = config.webhookSecret;
  }

  private getProjectPath(owner: string, name: string): string {
    return `${owner}/${name}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapUser(user: any): GitUser {
    return {
      id: String(user?.id || 0),
      username: user?.username || 'unknown',
      email: user?.email,
      avatarUrl: user?.avatar_url,
    };
  }

  // Repository operations
  async getRepository(owner: string, name: string): Promise<GitRepository> {
    const project = await this.api.Projects.show(this.getProjectPath(owner, name));
    return {
      id: String(project.id),
      name: String(project.name || name),
      fullName: String(project.path_with_namespace || `${owner}/${name}`),
      owner: String(project.namespace?.full_path || owner),
      description: project.description || undefined,
      defaultBranch: String(project.default_branch || 'main'),
      isPrivate: project.visibility === 'private',
      url: String(project.web_url || ''),
      cloneUrl: String(project.http_url_to_repo || ''),
    };
  }

  async listBranches(owner: string, repo: string): Promise<GitBranch[]> {
    const projectPath = this.getProjectPath(owner, repo);
    const [branches, project] = await Promise.all([
      this.api.Branches.all(projectPath),
      this.api.Projects.show(projectPath),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (branches || []).map((branch: any) => ({
      name: String(branch.name || ''),
      sha: String(branch.commit?.id || ''),
      isDefault: branch.name === project.default_branch,
      isProtected: Boolean(branch.protected),
    }));
  }

  async deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
    await this.api.Branches.remove(this.getProjectPath(owner, repo), branch);
  }

  async compareBranches(owner: string, repo: string, base: string, head: string): Promise<BranchComparison> {
    const compare = await this.api.Repositories.compare(this.getProjectPath(owner, repo), base, head);

    return {
      ahead: compare.commits?.length || 0,
      behind: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      commits: (compare.commits || []).map((commit: any) => ({
        sha: String(commit.id || ''),
        message: String(commit.message || ''),
        author: {
          id: '0',
          username: String(commit.author_name || 'unknown'),
          email: commit.author_email,
        },
        date: new Date(commit.created_at || Date.now()),
        url: String(commit.web_url || ''),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      files: (compare.diffs || []).map((diff: any) => ({
        filename: String(diff.new_path || ''),
        status: this.mapDiffStatus(diff),
        additions: 0,
        deletions: 0,
        patch: diff.diff,
        previousFilename: diff.old_path !== diff.new_path ? diff.old_path : undefined,
      })),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapDiffStatus(diff: any): 'added' | 'modified' | 'removed' | 'renamed' {
    if (diff.new_file) return 'added';
    if (diff.deleted_file) return 'removed';
    if (diff.renamed_file) return 'renamed';
    return 'modified';
  }

  // Pull Request (Merge Request) operations
  async listPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitPullRequest[]> {
    const stateMap: Record<string, string> = {
      open: 'opened',
      closed: 'closed',
      all: 'all',
    };

    const mrs = await this.api.MergeRequests.all({
      projectId: this.getProjectPath(owner, repo),
      state: stateMap[state],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (mrs || []).map((mr: any) => ({
      id: String(mr.id),
      number: mr.iid,
      title: String(mr.title || ''),
      description: mr.description || undefined,
      state: mr.state === 'merged' ? 'merged' : mr.state === 'opened' ? 'open' : 'closed' as const,
      author: this.mapUser(mr.author),
      sourceBranch: String(mr.source_branch || ''),
      targetBranch: String(mr.target_branch || ''),
      url: String(mr.web_url || ''),
      isDraft: Boolean(mr.draft || mr.work_in_progress),
      createdAt: new Date(mr.created_at || Date.now()),
      updatedAt: new Date(mr.updated_at || Date.now()),
      mergedAt: mr.merged_at ? new Date(mr.merged_at) : undefined,
    }));
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<GitPullRequest> {
    const mr = await this.api.MergeRequests.show(this.getProjectPath(owner, repo), number);

    return {
      id: String(mr.id),
      number: mr.iid,
      title: String(mr.title || ''),
      description: mr.description || undefined,
      state: mr.state === 'merged' ? 'merged' : mr.state === 'opened' ? 'open' : 'closed',
      author: this.mapUser(mr.author),
      sourceBranch: String(mr.source_branch || ''),
      targetBranch: String(mr.target_branch || ''),
      url: String(mr.web_url || ''),
      isDraft: Boolean(mr.draft || mr.work_in_progress),
      createdAt: new Date(mr.created_at || Date.now()),
      updatedAt: new Date(mr.updated_at || Date.now()),
      mergedAt: mr.merged_at ? new Date(mr.merged_at) : undefined,
      changedFiles: mr.changes_count ? parseInt(String(mr.changes_count), 10) : undefined,
    };
  }

  async getPullRequestFiles(owner: string, repo: string, number: number): Promise<GitPullRequestFile[]> {
    const changes = await this.api.MergeRequests.allDiffs(this.getProjectPath(owner, repo), number);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (changes || []).map((diff: any) => ({
      filename: String(diff.new_path || ''),
      status: this.mapDiffStatus(diff),
      additions: 0,
      deletions: 0,
      patch: diff.diff,
      previousFilename: diff.old_path !== diff.new_path ? diff.old_path : undefined,
    }));
  }

  async getPullRequestCommits(owner: string, repo: string, number: number): Promise<GitCommit[]> {
    const commits = await this.api.MergeRequests.allCommits(this.getProjectPath(owner, repo), number);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (commits || []).map((commit: any) => ({
      sha: String(commit.id || ''),
      message: String(commit.message || ''),
      author: {
        id: '0',
        username: String(commit.author_name || 'unknown'),
        email: commit.author_email,
      },
      date: new Date(commit.created_at || Date.now()),
      url: '',
    }));
  }

  async createPRReview(owner: string, repo: string, number: number, review: CreatePRReviewInput): Promise<GitReview> {
    const projectPath = this.getProjectPath(owner, repo);

    if (review.event === 'APPROVE') {
      await this.api.MergeRequestApprovals.approve(projectPath, number);
    } else if (review.event === 'REQUEST_CHANGES' || review.event === 'COMMENT') {
      if (review.body) {
        await this.api.MergeRequestNotes.create(projectPath, number, review.body);
      }
    }

    return {
      id: '0',
      state: review.event === 'APPROVE' ? 'approved' : review.event === 'REQUEST_CHANGES' ? 'changes_requested' : 'commented',
      body: review.body,
      author: { id: '0', username: 'self' },
      createdAt: new Date(),
    };
  }

  async approvePR(owner: string, repo: string, number: number, body?: string): Promise<GitReview> {
    return this.createPRReview(owner, repo, number, { event: 'APPROVE', body });
  }

  async requestChanges(owner: string, repo: string, number: number, body: string): Promise<GitReview> {
    return this.createPRReview(owner, repo, number, { event: 'REQUEST_CHANGES', body });
  }

  async addPRComment(owner: string, repo: string, number: number, body: string): Promise<GitComment> {
    const note = await this.api.MergeRequestNotes.create(this.getProjectPath(owner, repo), number, body);

    return {
      id: String(note.id),
      body: String(note.body || ''),
      author: this.mapUser(note.author),
      createdAt: new Date(note.created_at || Date.now()),
      updatedAt: new Date(note.updated_at || Date.now()),
    };
  }

  async addLineComment(owner: string, repo: string, number: number, path: string, line: number, body: string): Promise<GitComment> {
    const projectPath = this.getProjectPath(owner, repo);
    const mr = await this.api.MergeRequests.show(projectPath, number);

    const discussion = await this.api.MergeRequestDiscussions.create(projectPath, number, body, {
      position: {
        base_sha: mr.diff_refs?.base_sha || '',
        head_sha: mr.diff_refs?.head_sha || '',
        start_sha: mr.diff_refs?.start_sha || '',
        position_type: 'text',
        new_path: path,
        new_line: line,
      },
    });

    const firstNote = discussion.notes?.[0];
    return {
      id: firstNote ? String(firstNote.id) : String(discussion.id),
      body,
      author: firstNote?.author ? this.mapUser(firstNote.author) : { id: '0', username: 'self' },
      createdAt: new Date(),
      updatedAt: new Date(),
      path,
      line,
    };
  }

  async getPRComments(owner: string, repo: string, number: number): Promise<GitComment[]> {
    const notes = await this.api.MergeRequestNotes.all(this.getProjectPath(owner, repo), number);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (notes || []).map((note: any) => ({
      id: String(note.id),
      body: String(note.body || ''),
      author: this.mapUser(note.author),
      createdAt: new Date(note.created_at || Date.now()),
      updatedAt: new Date(note.updated_at || Date.now()),
    }));
  }

  async getPRReviews(owner: string, repo: string, number: number): Promise<GitReview[]> {
    const approvals = await this.api.MergeRequestApprovals.approvalState(this.getProjectPath(owner, repo), number);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (approvals.rules || []).flatMap((rule: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rule.approved_by || []).map((user: any) => ({
        id: String(user.id),
        state: 'approved' as const,
        author: this.mapUser(user),
        createdAt: new Date(),
      }))
    );
  }

  async mergePR(owner: string, repo: string, number: number, commitTitle?: string, mergeMethod?: 'merge' | 'squash' | 'rebase'): Promise<void> {
    await this.api.MergeRequests.merge(this.getProjectPath(owner, repo), number, {
      merge_commit_message: commitTitle,
      squash: mergeMethod === 'squash',
    });
  }

  // Issue operations
  async listIssues(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitIssue[]> {
    const stateMap: Record<string, string> = {
      open: 'opened',
      closed: 'closed',
      all: 'all',
    };

    const issues = await this.api.Issues.all({
      projectId: this.getProjectPath(owner, repo),
      state: stateMap[state],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (issues || []).map((issue: any) => ({
      id: String(issue.id),
      number: issue.iid,
      title: String(issue.title || ''),
      body: issue.description || undefined,
      state: issue.state === 'opened' ? 'open' : 'closed' as const,
      author: this.mapUser(issue.author),
      labels: issue.labels || [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assignees: (issue.assignees || []).map((a: any) => this.mapUser(a)),
      url: String(issue.web_url || ''),
      createdAt: new Date(issue.created_at || Date.now()),
      updatedAt: new Date(issue.updated_at || Date.now()),
    }));
  }

  async getIssue(owner: string, repo: string, number: number): Promise<GitIssue> {
    const issue = await this.api.Issues.show(this.getProjectPath(owner, repo), number);

    return {
      id: String(issue.id),
      number: issue.iid,
      title: String(issue.title || ''),
      body: issue.description || undefined,
      state: issue.state === 'opened' ? 'open' : 'closed',
      author: this.mapUser(issue.author),
      labels: issue.labels || [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assignees: (issue.assignees || []).map((a: any) => this.mapUser(a)),
      url: String(issue.web_url || ''),
      createdAt: new Date(issue.created_at || Date.now()),
      updatedAt: new Date(issue.updated_at || Date.now()),
    };
  }

  async createIssue(owner: string, repo: string, issue: CreateIssueInput): Promise<GitIssue> {
    const created = await this.api.Issues.create(this.getProjectPath(owner, repo), issue.title, {
      description: issue.body,
      labels: issue.labels?.join(','),
    });

    return {
      id: String(created.id),
      number: created.iid,
      title: String(created.title || ''),
      body: created.description || undefined,
      state: 'open',
      author: this.mapUser(created.author),
      labels: created.labels || [],
      assignees: [],
      url: String(created.web_url || ''),
      createdAt: new Date(created.created_at || Date.now()),
      updatedAt: new Date(created.updated_at || Date.now()),
    };
  }

  async updateIssue(owner: string, repo: string, number: number, update: Partial<CreateIssueInput>): Promise<GitIssue> {
    const updated = await this.api.Issues.edit(this.getProjectPath(owner, repo), number, {
      title: update.title,
      description: update.body,
      labels: update.labels?.join(','),
    });

    return {
      id: String(updated.id),
      number: updated.iid,
      title: String(updated.title || ''),
      body: updated.description || undefined,
      state: updated.state === 'opened' ? 'open' : 'closed',
      author: this.mapUser(updated.author),
      labels: updated.labels || [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assignees: (updated.assignees || []).map((a: any) => this.mapUser(a)),
      url: String(updated.web_url || ''),
      createdAt: new Date(updated.created_at || Date.now()),
      updatedAt: new Date(updated.updated_at || Date.now()),
    };
  }

  async closeIssue(owner: string, repo: string, number: number): Promise<GitIssue> {
    const closed = await this.api.Issues.edit(this.getProjectPath(owner, repo), number, {
      stateEvent: 'close',
    } as any);
    return {
      id: String(closed.id),
      number: closed.iid,
      title: String(closed.title || ''),
      body: closed.description || undefined,
      state: 'closed',
      author: this.mapUser(closed.author),
      labels: closed.labels || [],
      assignees: (closed.assignees || []).map((a: any) => this.mapUser(a)),
      url: String(closed.web_url || ''),
      createdAt: new Date(closed.created_at || Date.now()),
      updatedAt: new Date(closed.updated_at || Date.now()),
    };
  }

  async addIssueComment(owner: string, repo: string, number: number, body: string): Promise<GitComment> {
    const note = await this.api.IssueNotes.create(this.getProjectPath(owner, repo), number, body);

    return {
      id: String(note.id),
      body: String(note.body || ''),
      author: this.mapUser(note.author),
      createdAt: new Date(note.created_at || Date.now()),
      updatedAt: new Date(note.updated_at || Date.now()),
    };
  }

  // CI/CD operations (GitLab Pipelines)
  async getWorkflowRuns(owner: string, repo: string, branch?: string): Promise<GitWorkflowRun[]> {
    const pipelines = await this.api.Pipelines.all(this.getProjectPath(owner, repo), {
      ref: branch,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (pipelines || []).map((pipeline: any) => ({
      id: String(pipeline.id),
      name: `Pipeline #${pipeline.id}`,
      status: this.mapPipelineStatus(pipeline.status),
      conclusion: this.mapPipelineConclusion(pipeline.status),
      url: String(pipeline.web_url || ''),
      branch: String(pipeline.ref || ''),
      sha: String(pipeline.sha || ''),
      createdAt: new Date(pipeline.created_at || Date.now()),
      updatedAt: new Date(pipeline.updated_at || Date.now()),
    }));
  }

  private mapPipelineStatus(status: string): 'queued' | 'in_progress' | 'completed' {
    switch (status) {
      case 'pending':
      case 'waiting_for_resource':
      case 'preparing':
      case 'scheduled':
        return 'queued';
      case 'running':
        return 'in_progress';
      default:
        return 'completed';
    }
  }

  private mapPipelineConclusion(status: string): 'success' | 'failure' | 'cancelled' | 'skipped' | undefined {
    switch (status) {
      case 'success': return 'success';
      case 'failed': return 'failure';
      case 'canceled': return 'cancelled';
      case 'skipped': return 'skipped';
      default: return undefined;
    }
  }

  async getWorkflowRun(owner: string, repo: string, runId: string): Promise<GitWorkflowRun> {
    const pipeline = await this.api.Pipelines.show(this.getProjectPath(owner, repo), parseInt(runId, 10));

    return {
      id: String(pipeline.id),
      name: `Pipeline #${pipeline.id}`,
      status: this.mapPipelineStatus(pipeline.status),
      conclusion: this.mapPipelineConclusion(pipeline.status),
      url: String(pipeline.web_url || ''),
      branch: String(pipeline.ref || ''),
      sha: String(pipeline.sha || ''),
      createdAt: new Date(pipeline.created_at || Date.now()),
      updatedAt: new Date(pipeline.updated_at || Date.now()),
    };
  }

  async getWorkflowJobs(owner: string, repo: string, runId: string): Promise<GitJob[]> {
    const jobs = await this.api.Jobs.all(this.getProjectPath(owner, repo), {
      pipelineId: parseInt(runId, 10),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (jobs || []).map((job: any) => ({
      id: String(job.id),
      name: String(job.name || ''),
      status: this.mapPipelineStatus(job.status),
      conclusion: this.mapPipelineConclusion(job.status) as 'success' | 'failure' | 'cancelled' | 'skipped' | undefined,
      startedAt: job.started_at ? new Date(job.started_at) : undefined,
      completedAt: job.finished_at ? new Date(job.finished_at) : undefined,
    }));
  }

  async getJobLogs(owner: string, repo: string, jobId: string): Promise<string> {
    const trace = await this.api.Jobs.showLog(this.getProjectPath(owner, repo), parseInt(jobId, 10));
    return String(trace || '');
  }

  async retryWorkflow(owner: string, repo: string, runId: string): Promise<void> {
    await this.api.Pipelines.retry(this.getProjectPath(owner, repo), parseInt(runId, 10));
  }

  async cancelWorkflow(owner: string, repo: string, runId: string): Promise<void> {
    await this.api.Pipelines.cancel(this.getProjectPath(owner, repo), parseInt(runId, 10));
  }

  // Release operations
  async listReleases(owner: string, repo: string): Promise<GitRelease[]> {
    const releases = await this.api.ProjectReleases.all(this.getProjectPath(owner, repo));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (releases || []).map((release: any) => ({
      id: String(release.tag_name || ''),
      tagName: String(release.tag_name || ''),
      name: String(release.name || release.tag_name || ''),
      body: release.description || undefined,
      isDraft: false,
      isPrerelease: false,
      url: release._links?.self || '',
      createdAt: new Date(release.created_at || Date.now()),
      author: release.author ? this.mapUser(release.author) : { id: '0', username: 'unknown' },
    }));
  }

  async createRelease(owner: string, repo: string, release: CreateReleaseInput): Promise<GitRelease> {
    const created = await this.api.ProjectReleases.create(this.getProjectPath(owner, repo), {
      tagName: release.tagName,
      name: release.name,
      description: release.body,
      ref: release.targetCommitish,
    });

    return {
      id: String(created.tag_name || ''),
      tagName: String(created.tag_name || ''),
      name: String(created.name || created.tag_name || ''),
      body: created.description || undefined,
      isDraft: false,
      isPrerelease: false,
      url: created._links?.self || '',
      createdAt: new Date(created.created_at || Date.now()),
      author: created.author ? this.mapUser(created.author) : { id: '0', username: 'unknown' },
    };
  }

  // File operations
  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    const file = await this.api.RepositoryFiles.show(this.getProjectPath(owner, repo), path, ref || 'HEAD');
    return Buffer.from(file.content, 'base64').toString('utf-8');
  }

  async listFiles(owner: string, repo: string, path = '', ref?: string): Promise<string[]> {
    const tree = await this.api.Repositories.allRepositoryTrees(this.getProjectPath(owner, repo), {
      path,
      ref,
      recursive: false,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (tree || []).map((item: any) => String(item.path || ''));
  }

  // File write operations
  async createOrUpdateFile(owner: string, repo: string, input: import('./types.js').CreateFileInput): Promise<void> {
    const projectPath = this.getProjectPath(owner, repo);
    try {
      await this.api.RepositoryFiles.edit(projectPath, input.path, input.branch || 'main', {
        content: input.content, commitMessage: input.message,
      });
    } catch {
      await this.api.RepositoryFiles.create(projectPath, input.path, input.branch || 'main', {
        content: input.content, commitMessage: input.message,
      });
    }
  }

  async deleteFile(owner: string, repo: string, path: string, message: string, branch?: string): Promise<void> {
    await this.api.RepositoryFiles.remove(this.getProjectPath(owner, repo), path, branch || 'main', { commitMessage: message });
  }

  async searchCode(owner: string, repo: string, query: string): Promise<import('./types.js').CodeSearchResult[]> {
    const results = await this.api.Search.all('blobs', query, { projectId: this.getProjectPath(owner, repo) });
    return (results || []).map((r: any) => ({ path: String(r.filename || ''), matches: [{ line: 0, content: String(r.data || '') }] }));
  }

  async createBranch(owner: string, repo: string, branchName: string, fromRef: string): Promise<import('./types.js').GitBranch> {
    const branch = await this.api.Branches.create(this.getProjectPath(owner, repo), branchName, fromRef);
    return { name: String((branch as any).name), sha: String((branch as any).commit?.id || ''), isDefault: false, isProtected: false };
  }

  async createPullRequest(owner: string, repo: string, input: import('./types.js').CreatePullRequestInput): Promise<import('./types.js').GitPullRequest> {
    const mr = await this.api.MergeRequests.create(this.getProjectPath(owner, repo), input.head, input.base, input.title, { description: input.body });
    return {
      id: String((mr as any).id), number: (mr as any).iid, title: input.title,
      description: input.body, state: 'open', sourceBranch: input.head, targetBranch: input.base,
      author: { id: String((mr as any).author?.id || ''), username: String((mr as any).author?.username || '') },
      url: String((mr as any).web_url || ''), isDraft: false,
      createdAt: new Date(), updatedAt: new Date(),
    };
  }

  async listWorkflows(owner: string, repo: string): Promise<import('./types.js').GitWorkflow[]> {
    const pipelines = await this.api.Pipelines.all(this.getProjectPath(owner, repo), { perPage: 20 });
    return (pipelines || []).map((p: any) => ({ id: String(p.id), name: `Pipeline #${p.id}`, path: '.gitlab-ci.yml', state: 'active' as const }));
  }

  async getWorkflowConfig(owner: string, repo: string, _workflowId: string): Promise<string> {
    return this.getFileContent(owner, repo, '.gitlab-ci.yml');
  }

  async triggerWorkflow(owner: string, repo: string, _workflowId: string, ref: string, inputs?: Record<string, string>): Promise<import('./types.js').GitWorkflowRun> {
    const variables = inputs ? Object.entries(inputs).map(([key, value]) => ({ key, value, variable_type: 'env_var' })) : undefined;
    const pipeline = await this.api.Pipelines.create(this.getProjectPath(owner, repo), { ref, variables } as any);
    return {
      id: String((pipeline as any).id), name: `Pipeline #${(pipeline as any).id}`,
      status: 'queued', branch: ref, sha: String((pipeline as any).sha || ''),
      url: String((pipeline as any).web_url || ''), createdAt: new Date(), updatedAt: new Date(),
    };
  }

  async listEnvironments(owner: string, repo: string): Promise<import('./types.js').GitEnvironment[]> {
    const envs = await this.api.Environments.all(this.getProjectPath(owner, repo));
    return (envs || []).map((e: any) => ({ id: String(e.id), name: String(e.name), url: e.external_url }));
  }

  async getEnvironmentVariables(owner: string, repo: string, _envName: string): Promise<import('./types.js').GitVariable[]> {
    const vars = await this.api.ProjectVariables.all(this.getProjectPath(owner, repo));
    return (vars || []).map((v: any) => ({ name: String(v.key), value: String(v.value), isSecret: v.masked || false }));
  }

  async setEnvironmentVariable(owner: string, repo: string, _envName: string, name: string, value: string, isSecret = false): Promise<void> {
    try {
      await this.api.ProjectVariables.edit(this.getProjectPath(owner, repo), name, { value, masked: isSecret });
    } catch {
      await this.api.ProjectVariables.create(this.getProjectPath(owner, repo), { key: name, value, masked: isSecret } as any);
    }
  }

  async deleteEnvironmentVariable(owner: string, repo: string, _envName: string, name: string): Promise<void> {
    await this.api.ProjectVariables.remove(this.getProjectPath(owner, repo), name);
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

  async listDeployments(owner: string, repo: string, environment?: string): Promise<import('./types.js').GitDeployment[]> {
    const deployments = await this.api.Deployments.all(this.getProjectPath(owner, repo), { environment });
    return (deployments || []).map((d: any) => ({
      id: String(d.id), environment: String(d.environment?.name || environment || ''),
      status: 'success' as const, sha: String(d.sha || ''), createdAt: new Date(d.created_at),
    }));
  }

  async createDeployment(owner: string, repo: string, ref: string, environment: string, _description?: string): Promise<import('./types.js').GitDeployment> {
    const env = await this.api.Environments.create(this.getProjectPath(owner, repo), { name: environment } as any).catch(() => null);
    return { id: String(env ? (env as any).id : Date.now()), environment, status: 'pending', sha: ref, createdAt: new Date() };
  }

  async updateDeploymentStatus(_owner: string, _repo: string, _deploymentId: string, _state: 'success' | 'failure' | 'in_progress'): Promise<void> {
    // GitLab deployments are managed through CI pipeline statuses
  }

  // Webhook verification
  verifyWebhookSignature(payload: string | Buffer, signature: string, secret: string): boolean {
    return signature === secret;
  }
}
