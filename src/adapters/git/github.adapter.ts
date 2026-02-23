import { Octokit } from 'octokit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { type GitHubConfig } from '../../config/schema.js';
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

export class GitHubAdapter implements GitProviderAdapter {
  readonly provider = 'github' as const;
  private octokit: Octokit;
  private logger = getLogger('github-adapter');
  private webhookSecret?: string;

  constructor(config: GitHubConfig) {
    this.octokit = new Octokit({
      auth: config.token,
      baseUrl: config.apiUrl !== 'https://api.github.com' ? config.apiUrl : undefined,
    });
    this.webhookSecret = config.webhookSecret;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapUser(user: any): GitUser {
    return {
      id: String(user?.id || 0),
      username: user?.login || user?.name || 'unknown',
      email: user?.email || undefined,
      avatarUrl: user?.avatar_url,
    };
  }

  // Repository operations
  async getRepository(owner: string, name: string): Promise<GitRepository> {
    const { data } = await this.octokit.rest.repos.get({ owner, repo: name });
    return {
      id: String(data.id),
      name: data.name,
      fullName: data.full_name,
      owner: data.owner.login,
      description: data.description || undefined,
      defaultBranch: data.default_branch,
      isPrivate: data.private,
      url: data.html_url,
      cloneUrl: data.clone_url,
    };
  }

  async listBranches(owner: string, repo: string): Promise<GitBranch[]> {
    const { data: branches } = await this.octokit.rest.repos.listBranches({
      owner,
      repo,
      per_page: 100,
    });

    const { data: repoData } = await this.octokit.rest.repos.get({ owner, repo });

    return branches.map(branch => ({
      name: branch.name,
      sha: branch.commit.sha,
      isDefault: branch.name === repoData.default_branch,
      isProtected: branch.protected,
    }));
  }

  async deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
    await this.octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
  }

  async compareBranches(owner: string, repo: string, base: string, head: string): Promise<BranchComparison> {
    const { data } = await this.octokit.rest.repos.compareCommits({
      owner,
      repo,
      base,
      head,
    });

    return {
      ahead: data.ahead_by,
      behind: data.behind_by,
      commits: data.commits.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: this.mapUser(commit.author || commit.commit.author),
        date: new Date(commit.commit.author?.date || Date.now()),
        url: commit.html_url,
      })),
      files: (data.files || []).map(file => ({
        filename: file.filename,
        status: this.mapFileStatus(file.status),
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch,
        previousFilename: file.previous_filename,
      })),
    };
  }

  private mapFileStatus(status: string): 'added' | 'modified' | 'removed' | 'renamed' {
    switch (status) {
      case 'added': return 'added';
      case 'removed': return 'removed';
      case 'renamed': return 'renamed';
      default: return 'modified';
    }
  }

  // Pull Request operations
  async listPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitPullRequest[]> {
    const { data } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state,
      per_page: 100,
    });

    return data.map(pr => ({
      id: String(pr.id),
      number: pr.number,
      title: pr.title,
      description: pr.body || undefined,
      state: pr.merged_at ? 'merged' : pr.state as 'open' | 'closed',
      author: this.mapUser(pr.user),
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      url: pr.html_url,
      isDraft: pr.draft || false,
      createdAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at),
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
    }));
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<GitPullRequest> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: number,
    });

    return {
      id: String(pr.id),
      number: pr.number,
      title: pr.title,
      description: pr.body || undefined,
      state: pr.merged_at ? 'merged' : pr.state as 'open' | 'closed',
      author: this.mapUser(pr.user),
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      url: pr.html_url,
      isDraft: pr.draft || false,
      createdAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at),
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
    };
  }

  async getPullRequestFiles(owner: string, repo: string, number: number): Promise<GitPullRequestFile[]> {
    const { data } = await this.octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: number,
      per_page: 100,
    });

    return data.map(file => ({
      filename: file.filename,
      status: this.mapFileStatus(file.status),
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch,
      previousFilename: file.previous_filename,
    }));
  }

  async getPullRequestCommits(owner: string, repo: string, number: number): Promise<GitCommit[]> {
    const { data } = await this.octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: number,
      per_page: 100,
    });

    return data.map(commit => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: this.mapUser(commit.author || commit.commit.author),
      date: new Date(commit.commit.author?.date || Date.now()),
      url: commit.html_url,
    }));
  }

  async createPRReview(owner: string, repo: string, number: number, review: CreatePRReviewInput): Promise<GitReview> {
    const { data } = await this.octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: number,
      body: review.body,
      event: review.event,
      comments: review.comments?.map(c => ({
        path: c.path,
        line: c.line,
        body: c.body,
      })),
    });

    return {
      id: String(data.id),
      state: this.mapReviewState(data.state),
      body: data.body || undefined,
      author: this.mapUser(data.user),
      createdAt: new Date(data.submitted_at || Date.now()),
    };
  }

  private mapReviewState(state: string): 'pending' | 'approved' | 'changes_requested' | 'commented' {
    switch (state.toLowerCase()) {
      case 'approved': return 'approved';
      case 'changes_requested': return 'changes_requested';
      case 'commented': return 'commented';
      default: return 'pending';
    }
  }

  async approvePR(owner: string, repo: string, number: number, body?: string): Promise<GitReview> {
    return this.createPRReview(owner, repo, number, { event: 'APPROVE', body });
  }

  async requestChanges(owner: string, repo: string, number: number, body: string): Promise<GitReview> {
    return this.createPRReview(owner, repo, number, { event: 'REQUEST_CHANGES', body });
  }

  async addPRComment(owner: string, repo: string, number: number, body: string): Promise<GitComment> {
    const { data } = await this.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body,
    });

    return {
      id: String(data.id),
      body: data.body || '',
      author: this.mapUser(data.user),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  async addLineComment(owner: string, repo: string, number: number, path: string, line: number, body: string): Promise<GitComment> {
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: number,
    });

    const { data } = await this.octokit.rest.pulls.createReviewComment({
      owner,
      repo,
      pull_number: number,
      body,
      path,
      commit_id: pr.head.sha,
      line,
    });

    return {
      id: String(data.id),
      body: data.body,
      author: this.mapUser(data.user),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      path: data.path,
      line: data.line,
    };
  }

  async getPRComments(owner: string, repo: string, number: number): Promise<GitComment[]> {
    const { data } = await this.octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: number,
      per_page: 100,
    });

    return data.map(comment => ({
      id: String(comment.id),
      body: comment.body,
      author: this.mapUser(comment.user),
      createdAt: new Date(comment.created_at),
      updatedAt: new Date(comment.updated_at),
      path: comment.path,
      line: comment.line,
    }));
  }

  async getPRReviews(owner: string, repo: string, number: number): Promise<GitReview[]> {
    const { data } = await this.octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: number,
      per_page: 100,
    });

    return data.map(review => ({
      id: String(review.id),
      state: this.mapReviewState(review.state),
      body: review.body || undefined,
      author: this.mapUser(review.user),
      createdAt: new Date(review.submitted_at || Date.now()),
    }));
  }

  async mergePR(owner: string, repo: string, number: number, commitTitle?: string, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<void> {
    await this.octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: number,
      commit_title: commitTitle,
      merge_method: mergeMethod,
    });
  }

  // Issue operations
  async listIssues(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitIssue[]> {
    const { data } = await this.octokit.rest.issues.listForRepo({
      owner,
      repo,
      state,
      per_page: 100,
    });

    return data
      .filter(issue => !issue.pull_request)
      .map(issue => ({
        id: String(issue.id),
        number: issue.number,
        title: issue.title,
        body: issue.body || undefined,
        state: issue.state as 'open' | 'closed',
        author: this.mapUser(issue.user),
        labels: issue.labels.map(l => (typeof l === 'string' ? l : l.name || '')),
        assignees: (issue.assignees || []).map(a => this.mapUser(a)),
        url: issue.html_url,
        createdAt: new Date(issue.created_at),
        updatedAt: new Date(issue.updated_at),
      }));
  }

  async getIssue(owner: string, repo: string, number: number): Promise<GitIssue> {
    const { data: issue } = await this.octokit.rest.issues.get({
      owner,
      repo,
      issue_number: number,
    });

    return {
      id: String(issue.id),
      number: issue.number,
      title: issue.title,
      body: issue.body || undefined,
      state: issue.state as 'open' | 'closed',
      author: this.mapUser(issue.user),
      labels: issue.labels.map(l => (typeof l === 'string' ? l : l.name || '')),
      assignees: (issue.assignees || []).map(a => this.mapUser(a)),
      url: issue.html_url,
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(issue.updated_at),
    };
  }

  async createIssue(owner: string, repo: string, issue: CreateIssueInput): Promise<GitIssue> {
    const { data } = await this.octokit.rest.issues.create({
      owner,
      repo,
      title: issue.title,
      body: issue.body,
      labels: issue.labels,
      assignees: issue.assignees,
    });

    return {
      id: String(data.id),
      number: data.number,
      title: data.title,
      body: data.body || undefined,
      state: data.state as 'open' | 'closed',
      author: this.mapUser(data.user),
      labels: data.labels.map(l => (typeof l === 'string' ? l : l.name || '')),
      assignees: (data.assignees || []).map(a => this.mapUser(a)),
      url: data.html_url,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  async updateIssue(owner: string, repo: string, number: number, update: Partial<CreateIssueInput>): Promise<GitIssue> {
    const { data } = await this.octokit.rest.issues.update({
      owner,
      repo,
      issue_number: number,
      title: update.title,
      body: update.body,
      labels: update.labels,
      assignees: update.assignees,
    });

    return {
      id: String(data.id),
      number: data.number,
      title: data.title,
      body: data.body || undefined,
      state: data.state as 'open' | 'closed',
      author: this.mapUser(data.user),
      labels: data.labels.map(l => (typeof l === 'string' ? l : l.name || '')),
      assignees: (data.assignees || []).map(a => this.mapUser(a)),
      url: data.html_url,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  async addIssueComment(owner: string, repo: string, number: number, body: string): Promise<GitComment> {
    const { data } = await this.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body,
    });

    return {
      id: String(data.id),
      body: data.body || '',
      author: this.mapUser(data.user),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  // CI/CD operations
  async getWorkflowRuns(owner: string, repo: string, branch?: string): Promise<GitWorkflowRun[]> {
    const { data } = await this.octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      branch,
      per_page: 50,
    });

    return data.workflow_runs.map(run => ({
      id: String(run.id),
      name: run.name || 'Unknown',
      status: this.mapWorkflowStatus(run.status || ''),
      conclusion: run.conclusion ? this.mapWorkflowConclusion(run.conclusion) : undefined,
      url: run.html_url,
      branch: run.head_branch || '',
      sha: run.head_sha,
      createdAt: new Date(run.created_at),
      updatedAt: new Date(run.updated_at),
    }));
  }

  private mapWorkflowStatus(status: string): 'queued' | 'in_progress' | 'completed' {
    switch (status) {
      case 'queued':
      case 'waiting':
      case 'pending':
        return 'queued';
      case 'in_progress':
        return 'in_progress';
      default:
        return 'completed';
    }
  }

  private mapWorkflowConclusion(conclusion: string): 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' {
    switch (conclusion) {
      case 'success': return 'success';
      case 'failure': return 'failure';
      case 'cancelled': return 'cancelled';
      case 'skipped': return 'skipped';
      case 'timed_out': return 'timed_out';
      default: return 'failure';
    }
  }

  async getWorkflowRun(owner: string, repo: string, runId: string): Promise<GitWorkflowRun> {
    const { data: run } = await this.octokit.rest.actions.getWorkflowRun({
      owner,
      repo,
      run_id: parseInt(runId, 10),
    });

    return {
      id: String(run.id),
      name: run.name || 'Unknown',
      status: this.mapWorkflowStatus(run.status || ''),
      conclusion: run.conclusion ? this.mapWorkflowConclusion(run.conclusion) : undefined,
      url: run.html_url,
      branch: run.head_branch || '',
      sha: run.head_sha,
      createdAt: new Date(run.created_at),
      updatedAt: new Date(run.updated_at),
    };
  }

  async getWorkflowJobs(owner: string, repo: string, runId: string): Promise<GitJob[]> {
    const { data } = await this.octokit.rest.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: parseInt(runId, 10),
    });

    return data.jobs.map(job => ({
      id: String(job.id),
      name: job.name,
      status: this.mapWorkflowStatus(job.status),
      conclusion: job.conclusion ? this.mapJobConclusion(job.conclusion) : undefined,
      startedAt: job.started_at ? new Date(job.started_at) : undefined,
      completedAt: job.completed_at ? new Date(job.completed_at) : undefined,
    }));
  }

  private mapJobConclusion(conclusion: string): 'success' | 'failure' | 'cancelled' | 'skipped' {
    switch (conclusion) {
      case 'success': return 'success';
      case 'failure': return 'failure';
      case 'cancelled': return 'cancelled';
      case 'skipped': return 'skipped';
      default: return 'failure';
    }
  }

  async getJobLogs(owner: string, repo: string, jobId: string): Promise<string> {
    const { data } = await this.octokit.rest.actions.downloadJobLogsForWorkflowRun({
      owner,
      repo,
      job_id: parseInt(jobId, 10),
    });

    return data as unknown as string;
  }

  async retryWorkflow(owner: string, repo: string, runId: string): Promise<void> {
    await this.octokit.rest.actions.reRunWorkflow({
      owner,
      repo,
      run_id: parseInt(runId, 10),
    });
  }

  async cancelWorkflow(owner: string, repo: string, runId: string): Promise<void> {
    await this.octokit.rest.actions.cancelWorkflowRun({
      owner,
      repo,
      run_id: parseInt(runId, 10),
    });
  }

  // Release operations
  async listReleases(owner: string, repo: string): Promise<GitRelease[]> {
    const { data } = await this.octokit.rest.repos.listReleases({
      owner,
      repo,
      per_page: 50,
    });

    return data.map(release => ({
      id: String(release.id),
      tagName: release.tag_name,
      name: release.name || release.tag_name,
      body: release.body || undefined,
      isDraft: release.draft,
      isPrerelease: release.prerelease,
      url: release.html_url,
      createdAt: new Date(release.created_at),
      author: this.mapUser(release.author),
    }));
  }

  async createRelease(owner: string, repo: string, release: CreateReleaseInput): Promise<GitRelease> {
    const { data } = await this.octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name: release.tagName,
      name: release.name,
      body: release.body,
      target_commitish: release.targetCommitish,
      draft: release.isDraft,
      prerelease: release.isPrerelease,
    });

    return {
      id: String(data.id),
      tagName: data.tag_name,
      name: data.name || data.tag_name,
      body: data.body || undefined,
      isDraft: data.draft,
      isPrerelease: data.prerelease,
      url: data.html_url,
      createdAt: new Date(data.created_at),
      author: this.mapUser(data.author),
    };
  }

  // File operations
  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    const { data } = await this.octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ('content' in data && (data as any).type === 'file') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Buffer.from((data as any).content, 'base64').toString('utf-8');
    }

    throw new Error(`Path ${path} is not a file`);
  }

  async listFiles(owner: string, repo: string, path = '', ref?: string): Promise<string[]> {
    const { data } = await this.octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (Array.isArray(data)) {
      return data.map(item => item.path);
    }

    return [path];
  }

  // Webhook verification
  verifyWebhookSignature(payload: string | Buffer, signature: string, secret: string): boolean {
    try {
      const payloadBuffer = typeof payload === 'string' ? Buffer.from(payload) : payload;
      const expected = `sha256=${createHmac('sha256', secret).update(payloadBuffer).digest('hex')}`;
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
