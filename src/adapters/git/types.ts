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

export interface GitWorkflow {
  id: string;
  name: string;
  path: string;
  state: 'active' | 'disabled';
}

export interface GitEnvironment {
  id: string;
  name: string;
  url?: string;
  protectionRules?: string[];
}

export interface GitVariable {
  name: string;
  value: string;
  isSecret: boolean;
}

export interface GitDeployment {
  id: string;
  environment: string;
  status: 'pending' | 'in_progress' | 'success' | 'failure';
  sha: string;
  url?: string;
  createdAt: Date;
}

export interface CreateFileInput {
  path: string;
  content: string;
  message: string;
  branch?: string;
  sha?: string;
}

export interface CreatePullRequestInput {
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
}

export interface CodeSearchResult {
  path: string;
  matches: Array<{ line: number; content: string }>;
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
  closeIssue(owner: string, repo: string, number: number): Promise<GitIssue>;
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
  createOrUpdateFile(owner: string, repo: string, input: CreateFileInput): Promise<void>;
  deleteFile(owner: string, repo: string, path: string, message: string, branch?: string, sha?: string): Promise<void>;
  searchCode(owner: string, repo: string, query: string): Promise<CodeSearchResult[]>;

  // Branch write operations
  createBranch(owner: string, repo: string, branchName: string, fromRef: string): Promise<GitBranch>;
  createPullRequest(owner: string, repo: string, input: CreatePullRequestInput): Promise<GitPullRequest>;

  // CI/CD Pipeline management
  listWorkflows(owner: string, repo: string): Promise<GitWorkflow[]>;
  getWorkflowConfig(owner: string, repo: string, workflowId: string): Promise<string>;
  triggerWorkflow(owner: string, repo: string, workflowId: string, ref: string, inputs?: Record<string, string>): Promise<GitWorkflowRun>;

  // Environment & Variable management
  listEnvironments(owner: string, repo: string): Promise<GitEnvironment[]>;
  getEnvironmentVariables(owner: string, repo: string, envName: string): Promise<GitVariable[]>;
  setEnvironmentVariable(owner: string, repo: string, envName: string, name: string, value: string, isSecret?: boolean): Promise<void>;
  deleteEnvironmentVariable(owner: string, repo: string, envName: string, name: string): Promise<void>;
  getRepositoryVariables(owner: string, repo: string): Promise<GitVariable[]>;
  setRepositoryVariable(owner: string, repo: string, name: string, value: string, isSecret?: boolean): Promise<void>;
  deleteRepositoryVariable(owner: string, repo: string, name: string): Promise<void>;

  // Deployment management
  listDeployments(owner: string, repo: string, environment?: string): Promise<GitDeployment[]>;
  createDeployment(owner: string, repo: string, ref: string, environment: string, description?: string): Promise<GitDeployment>;
  updateDeploymentStatus(owner: string, repo: string, deploymentId: string, state: 'success' | 'failure' | 'in_progress'): Promise<void>;

  // Webhook verification
  verifyWebhookSignature?(payload: string | Buffer, signature: string, secret: string): boolean;
}

export type GitProvider = 'github' | 'gitlab' | 'bitbucket';
