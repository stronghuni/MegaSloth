// Common interfaces for all Git providers

export interface GitUser {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string;
}

export interface GitRepository {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  description?: string;
  defaultBranch: string;
  isPrivate: boolean;
  url: string;
  cloneUrl: string;
}

export interface GitBranch {
  name: string;
  sha: string;
  isDefault: boolean;
  isProtected: boolean;
}

export interface GitPullRequest {
  id: string;
  number: number;
  title: string;
  description?: string;
  state: 'open' | 'closed' | 'merged';
  author: GitUser;
  sourceBranch: string;
  targetBranch: string;
  url: string;
  isDraft: boolean;
  createdAt: Date;
  updatedAt: Date;
  mergedAt?: Date;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}

export interface GitPullRequestFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
  previousFilename?: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: GitUser;
  date: Date;
  url: string;
}

export interface GitComment {
  id: string;
  body: string;
  author: GitUser;
  createdAt: Date;
  updatedAt: Date;
  path?: string;
  line?: number;
}

export interface GitReview {
  id: string;
  state: 'pending' | 'approved' | 'changes_requested' | 'commented';
  body?: string;
  author: GitUser;
  createdAt: Date;
}

export interface GitIssue {
  id: string;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  author: GitUser;
  labels: string[];
  assignees: GitUser[];
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GitWorkflowRun {
  id: string;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out';
  url: string;
  branch: string;
  sha: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GitJob {
  id: string;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
}

export interface GitRelease {
  id: string;
  tagName: string;
  name: string;
  body?: string;
  isDraft: boolean;
  isPrerelease: boolean;
  url: string;
  createdAt: Date;
  author: GitUser;
}

export interface CreatePRReviewInput {
  body?: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments?: Array<{
    path: string;
    line: number;
    body: string;
  }>;
}

export interface CreateIssueInput {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface CreateReleaseInput {
  tagName: string;
  name: string;
  body?: string;
  targetCommitish?: string;
  isDraft?: boolean;
  isPrerelease?: boolean;
}

export interface GitDiff {
  files: GitPullRequestFile[];
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface BranchComparison {
  ahead: number;
  behind: number;
  commits: GitCommit[];
  files: GitPullRequestFile[];
}

// Main adapter interface
export interface GitProviderAdapter {
  readonly provider: 'github' | 'gitlab' | 'bitbucket';

  // Repository operations
  getRepository(owner: string, name: string): Promise<GitRepository>;
  listBranches(owner: string, repo: string): Promise<GitBranch[]>;
  deleteBranch(owner: string, repo: string, branch: string): Promise<void>;
  compareBranches(owner: string, repo: string, base: string, head: string): Promise<BranchComparison>;

  // Pull Request operations
  listPullRequests(owner: string, repo: string, state?: 'open' | 'closed' | 'all'): Promise<GitPullRequest[]>;
  getPullRequest(owner: string, repo: string, number: number): Promise<GitPullRequest>;
  getPullRequestFiles(owner: string, repo: string, number: number): Promise<GitPullRequestFile[]>;
  getPullRequestCommits(owner: string, repo: string, number: number): Promise<GitCommit[]>;
  createPRReview(owner: string, repo: string, number: number, review: CreatePRReviewInput): Promise<GitReview>;
  approvePR(owner: string, repo: string, number: number, body?: string): Promise<GitReview>;
  requestChanges(owner: string, repo: string, number: number, body: string): Promise<GitReview>;
  addPRComment(owner: string, repo: string, number: number, body: string): Promise<GitComment>;
  addLineComment(owner: string, repo: string, number: number, path: string, line: number, body: string): Promise<GitComment>;
  getPRComments(owner: string, repo: string, number: number): Promise<GitComment[]>;
  getPRReviews(owner: string, repo: string, number: number): Promise<GitReview[]>;
  mergePR(owner: string, repo: string, number: number, commitTitle?: string, mergeMethod?: 'merge' | 'squash' | 'rebase'): Promise<void>;

  // Issue operations
  listIssues(owner: string, repo: string, state?: 'open' | 'closed' | 'all'): Promise<GitIssue[]>;
  getIssue(owner: string, repo: string, number: number): Promise<GitIssue>;
  createIssue(owner: string, repo: string, issue: CreateIssueInput): Promise<GitIssue>;
  updateIssue(owner: string, repo: string, number: number, update: Partial<CreateIssueInput>): Promise<GitIssue>;
  addIssueComment(owner: string, repo: string, number: number, body: string): Promise<GitComment>;

  // CI/CD operations
  getWorkflowRuns(owner: string, repo: string, branch?: string): Promise<GitWorkflowRun[]>;
  getWorkflowRun(owner: string, repo: string, runId: string): Promise<GitWorkflowRun>;
  getWorkflowJobs(owner: string, repo: string, runId: string): Promise<GitJob[]>;
  getJobLogs(owner: string, repo: string, jobId: string): Promise<string>;
  retryWorkflow(owner: string, repo: string, runId: string): Promise<void>;
  cancelWorkflow(owner: string, repo: string, runId: string): Promise<void>;

  // Release operations
  listReleases(owner: string, repo: string): Promise<GitRelease[]>;
  createRelease(owner: string, repo: string, release: CreateReleaseInput): Promise<GitRelease>;

  // File operations
  getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string>;
  listFiles(owner: string, repo: string, path?: string, ref?: string): Promise<string[]>;

  // Webhook verification
  verifyWebhookSignature?(payload: string | Buffer, signature: string, secret: string): boolean;
}

export type GitProvider = 'github' | 'gitlab' | 'bitbucket';
