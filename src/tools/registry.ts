import { type ToolDefinition, type ToolUse } from '../agent/claude-client.js';
import { type GitProviderAdapter } from '../adapters/git/types.js';
import { getLogger } from '../utils/logger.js';

export interface ToolContext {
  gitAdapter: GitProviderAdapter;
  owner: string;
  repo: string;
  prNumber?: number;
}

export type ToolHandler = (input: Record<string, unknown>, context: ToolContext) => Promise<string>;

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  category: 'git' | 'pr' | 'ci' | 'issue' | 'code' | 'release';
}

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();
  private logger = getLogger('tool-registry');

  register(tool: RegisteredTool): void {
    this.tools.set(tool.definition.name, tool);
    this.logger.debug({ toolName: tool.definition.name, category: tool.category }, 'Registered tool');
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  getDefinitions(categories?: string[]): ToolDefinition[] {
    const tools = Array.from(this.tools.values());
    if (categories) {
      return tools
        .filter(t => categories.includes(t.category))
        .map(t => t.definition);
    }
    return tools.map(t => t.definition);
  }

  async execute(toolUse: ToolUse, context: ToolContext): Promise<{ result: string; isError: boolean }> {
    const tool = this.tools.get(toolUse.name);
    if (!tool) {
      return {
        result: `Unknown tool: ${toolUse.name}`,
        isError: true,
      };
    }

    try {
      this.logger.debug({ toolName: toolUse.name, input: toolUse.input }, 'Executing tool');
      const result = await tool.handler(toolUse.input, context);
      this.logger.debug({ toolName: toolUse.name, resultLength: result.length }, 'Tool execution completed');
      return { result, isError: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ toolName: toolUse.name, error: errorMessage }, 'Tool execution failed');
      return { result: `Error: ${errorMessage}`, isError: true };
    }
  }

  listTools(): { name: string; category: string; description: string }[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.definition.name,
      category: t.category,
      description: t.definition.description,
    }));
  }
}

// Create and populate the default registry
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Git tools
  registry.register({
    category: 'git',
    definition: {
      name: 'git_diff',
      description: 'Get the diff for a pull request or between two branches',
      input_schema: {
        type: 'object',
        properties: {
          base: { type: 'string', description: 'Base branch or commit' },
          head: { type: 'string', description: 'Head branch or commit' },
        },
        required: ['base', 'head'],
      },
    },
    handler: async (input, context) => {
      const comparison = await context.gitAdapter.compareBranches(
        context.owner,
        context.repo,
        input.base as string,
        input.head as string
      );
      return JSON.stringify({
        ahead: comparison.ahead,
        behind: comparison.behind,
        files: comparison.files.map(f => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch?.substring(0, 2000), // Truncate long patches
        })),
      }, null, 2);
    },
  });

  registry.register({
    category: 'git',
    definition: {
      name: 'list_branches',
      description: 'List all branches in the repository',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_, context) => {
      const branches = await context.gitAdapter.listBranches(context.owner, context.repo);
      return JSON.stringify(branches, null, 2);
    },
  });

  registry.register({
    category: 'git',
    definition: {
      name: 'delete_branch',
      description: 'Delete a branch from the repository',
      input_schema: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'Name of the branch to delete' },
        },
        required: ['branch'],
      },
    },
    handler: async (input, context) => {
      await context.gitAdapter.deleteBranch(context.owner, context.repo, input.branch as string);
      return `Branch ${input.branch} deleted successfully`;
    },
  });

  // PR tools
  registry.register({
    category: 'pr',
    definition: {
      name: 'get_pr_details',
      description: 'Get details of a pull request',
      input_schema: {
        type: 'object',
        properties: {
          pr_number: { type: 'number', description: 'Pull request number' },
        },
        required: ['pr_number'],
      },
    },
    handler: async (input, context) => {
      const pr = await context.gitAdapter.getPullRequest(
        context.owner,
        context.repo,
        input.pr_number as number
      );
      return JSON.stringify(pr, null, 2);
    },
  });

  registry.register({
    category: 'pr',
    definition: {
      name: 'get_pr_files',
      description: 'Get the list of files changed in a pull request',
      input_schema: {
        type: 'object',
        properties: {
          pr_number: { type: 'number', description: 'Pull request number' },
        },
        required: ['pr_number'],
      },
    },
    handler: async (input, context) => {
      const files = await context.gitAdapter.getPullRequestFiles(
        context.owner,
        context.repo,
        input.pr_number as number
      );
      return JSON.stringify(files, null, 2);
    },
  });

  registry.register({
    category: 'pr',
    definition: {
      name: 'add_pr_comment',
      description: 'Add a comment to a pull request',
      input_schema: {
        type: 'object',
        properties: {
          pr_number: { type: 'number', description: 'Pull request number' },
          body: { type: 'string', description: 'Comment body in markdown' },
        },
        required: ['pr_number', 'body'],
      },
    },
    handler: async (input, context) => {
      const comment = await context.gitAdapter.addPRComment(
        context.owner,
        context.repo,
        input.pr_number as number,
        input.body as string
      );
      return `Comment added: ${comment.id}`;
    },
  });

  registry.register({
    category: 'pr',
    definition: {
      name: 'add_line_comment',
      description: 'Add a comment to a specific line in a pull request',
      input_schema: {
        type: 'object',
        properties: {
          pr_number: { type: 'number', description: 'Pull request number' },
          path: { type: 'string', description: 'File path' },
          line: { type: 'number', description: 'Line number' },
          body: { type: 'string', description: 'Comment body' },
        },
        required: ['pr_number', 'path', 'line', 'body'],
      },
    },
    handler: async (input, context) => {
      const comment = await context.gitAdapter.addLineComment(
        context.owner,
        context.repo,
        input.pr_number as number,
        input.path as string,
        input.line as number,
        input.body as string
      );
      return `Line comment added: ${comment.id}`;
    },
  });

  registry.register({
    category: 'pr',
    definition: {
      name: 'approve_pr',
      description: 'Approve a pull request',
      input_schema: {
        type: 'object',
        properties: {
          pr_number: { type: 'number', description: 'Pull request number' },
          body: { type: 'string', description: 'Optional approval message' },
        },
        required: ['pr_number'],
      },
    },
    handler: async (input, context) => {
      await context.gitAdapter.approvePR(
        context.owner,
        context.repo,
        input.pr_number as number,
        input.body as string | undefined
      );
      return 'PR approved';
    },
  });

  registry.register({
    category: 'pr',
    definition: {
      name: 'request_changes',
      description: 'Request changes on a pull request',
      input_schema: {
        type: 'object',
        properties: {
          pr_number: { type: 'number', description: 'Pull request number' },
          body: { type: 'string', description: 'Description of requested changes' },
        },
        required: ['pr_number', 'body'],
      },
    },
    handler: async (input, context) => {
      await context.gitAdapter.requestChanges(
        context.owner,
        context.repo,
        input.pr_number as number,
        input.body as string
      );
      return 'Changes requested';
    },
  });

  // CI tools
  registry.register({
    category: 'ci',
    definition: {
      name: 'get_ci_status',
      description: 'Get CI/CD workflow status for a branch',
      input_schema: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'Branch name (optional)' },
        },
      },
    },
    handler: async (input, context) => {
      const runs = await context.gitAdapter.getWorkflowRuns(
        context.owner,
        context.repo,
        input.branch as string | undefined
      );
      return JSON.stringify(runs.slice(0, 10), null, 2);
    },
  });

  registry.register({
    category: 'ci',
    definition: {
      name: 'get_workflow_jobs',
      description: 'Get jobs for a specific workflow run',
      input_schema: {
        type: 'object',
        properties: {
          run_id: { type: 'string', description: 'Workflow run ID' },
        },
        required: ['run_id'],
      },
    },
    handler: async (input, context) => {
      const jobs = await context.gitAdapter.getWorkflowJobs(
        context.owner,
        context.repo,
        input.run_id as string
      );
      return JSON.stringify(jobs, null, 2);
    },
  });

  registry.register({
    category: 'ci',
    definition: {
      name: 'get_job_logs',
      description: 'Get logs for a specific job',
      input_schema: {
        type: 'object',
        properties: {
          job_id: { type: 'string', description: 'Job ID' },
        },
        required: ['job_id'],
      },
    },
    handler: async (input, context) => {
      const logs = await context.gitAdapter.getJobLogs(
        context.owner,
        context.repo,
        input.job_id as string
      );
      // Truncate very long logs
      return logs.length > 10000 ? logs.substring(logs.length - 10000) : logs;
    },
  });

  registry.register({
    category: 'ci',
    definition: {
      name: 'retry_workflow',
      description: 'Retry a failed workflow run',
      input_schema: {
        type: 'object',
        properties: {
          run_id: { type: 'string', description: 'Workflow run ID to retry' },
        },
        required: ['run_id'],
      },
    },
    handler: async (input, context) => {
      await context.gitAdapter.retryWorkflow(
        context.owner,
        context.repo,
        input.run_id as string
      );
      return 'Workflow retry initiated';
    },
  });

  // Issue tools
  registry.register({
    category: 'issue',
    definition: {
      name: 'list_issues',
      description: 'List issues in the repository',
      input_schema: {
        type: 'object',
        properties: {
          state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state filter' },
        },
      },
    },
    handler: async (input, context) => {
      const issues = await context.gitAdapter.listIssues(
        context.owner,
        context.repo,
        (input.state as 'open' | 'closed' | 'all') || 'open'
      );
      return JSON.stringify(issues.slice(0, 20), null, 2);
    },
  });

  registry.register({
    category: 'issue',
    definition: {
      name: 'create_issue',
      description: 'Create a new issue',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue body in markdown' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Labels to add' },
        },
        required: ['title'],
      },
    },
    handler: async (input, context) => {
      const issue = await context.gitAdapter.createIssue(context.owner, context.repo, {
        title: input.title as string,
        body: input.body as string | undefined,
        labels: input.labels as string[] | undefined,
      });
      return `Issue created: #${issue.number} - ${issue.url}`;
    },
  });

  registry.register({
    category: 'issue',
    definition: {
      name: 'add_issue_comment',
      description: 'Add a comment to an issue',
      input_schema: {
        type: 'object',
        properties: {
          issue_number: { type: 'number', description: 'Issue number' },
          body: { type: 'string', description: 'Comment body' },
        },
        required: ['issue_number', 'body'],
      },
    },
    handler: async (input, context) => {
      const comment = await context.gitAdapter.addIssueComment(
        context.owner,
        context.repo,
        input.issue_number as number,
        input.body as string
      );
      return `Comment added: ${comment.id}`;
    },
  });

  // Code tools
  registry.register({
    category: 'code',
    definition: {
      name: 'read_file',
      description: 'Read the contents of a file from the repository',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          ref: { type: 'string', description: 'Branch or commit ref (optional)' },
        },
        required: ['path'],
      },
    },
    handler: async (input, context) => {
      const content = await context.gitAdapter.getFileContent(
        context.owner,
        context.repo,
        input.path as string,
        input.ref as string | undefined
      );
      // Truncate very large files
      return content.length > 50000 ? content.substring(0, 50000) + '\n... (truncated)' : content;
    },
  });

  registry.register({
    category: 'code',
    definition: {
      name: 'list_files',
      description: 'List files in a directory',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (optional, defaults to root)' },
          ref: { type: 'string', description: 'Branch or commit ref (optional)' },
        },
      },
    },
    handler: async (input, context) => {
      const files = await context.gitAdapter.listFiles(
        context.owner,
        context.repo,
        input.path as string | undefined,
        input.ref as string | undefined
      );
      return JSON.stringify(files, null, 2);
    },
  });

  // Release tools
  registry.register({
    category: 'release',
    definition: {
      name: 'list_releases',
      description: 'List releases in the repository',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
    handler: async (_, context) => {
      const releases = await context.gitAdapter.listReleases(context.owner, context.repo);
      return JSON.stringify(releases.slice(0, 10), null, 2);
    },
  });

  registry.register({
    category: 'release',
    definition: {
      name: 'create_release',
      description: 'Create a new release',
      input_schema: {
        type: 'object',
        properties: {
          tag_name: { type: 'string', description: 'Tag name for the release' },
          name: { type: 'string', description: 'Release title' },
          body: { type: 'string', description: 'Release notes in markdown' },
          target: { type: 'string', description: 'Target branch or commit (optional)' },
          is_prerelease: { type: 'boolean', description: 'Mark as pre-release' },
        },
        required: ['tag_name', 'name'],
      },
    },
    handler: async (input, context) => {
      const release = await context.gitAdapter.createRelease(context.owner, context.repo, {
        tagName: input.tag_name as string,
        name: input.name as string,
        body: input.body as string | undefined,
        targetCommitish: input.target as string | undefined,
        isPrerelease: input.is_prerelease as boolean | undefined,
      });
      return `Release created: ${release.tagName} - ${release.url}`;
    },
  });

  return registry;
}
