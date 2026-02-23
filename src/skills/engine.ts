import { SkillRegistry } from './registry.js';
import { type ParsedSkill } from './parser.js';
import { AgentCore, type AgentTask, type AgentResult } from '../agent/core.js';
import { type GitProvider } from '../adapters/git/types.js';
import { type MetadataStore } from '../storage/index.js';
import { getLogger } from '../utils/logger.js';

export interface SkillExecutionContext {
  provider: GitProvider;
  owner: string;
  repo: string;
  eventType?: string;
  eventPayload?: Record<string, unknown>;
  prNumber?: number;
  issueNumber?: number;
  branch?: string;
  commit?: string;
}

export interface SkillExecutionResult extends AgentResult {
  skillName: string;
  context: SkillExecutionContext;
}

export class SkillEngine {
  private registry: SkillRegistry;
  private agentCore: AgentCore;
  private metadataStore: MetadataStore;
  private logger = getLogger('skill-engine');

  constructor(agentCore: AgentCore, metadataStore: MetadataStore) {
    this.registry = new SkillRegistry();
    this.agentCore = agentCore;
    this.metadataStore = metadataStore;
  }

  getRegistry(): SkillRegistry {
    return this.registry;
  }

  loadSkills(directory: string): number {
    return this.registry.loadFromDirectory(directory);
  }

  async executeSkill(skill: ParsedSkill, context: SkillExecutionContext): Promise<SkillExecutionResult> {
    this.logger.info({
      skillName: skill.metadata.name,
      provider: context.provider,
      repo: `${context.owner}/${context.repo}`,
      eventType: context.eventType,
    }, 'Executing skill');

    // Create agent event in database
    const repoRecord = await this.metadataStore.getRepositoryByFullName(
      context.provider,
      `${context.owner}/${context.repo}`
    );

    const agentEvent = await this.metadataStore.createAgentEvent({
      repositoryId: repoRecord?.id,
      eventType: context.eventType || 'skill_execution',
      skillName: skill.metadata.name,
      status: 'running',
      input: context as unknown as Record<string, unknown>,
    });

    try {
      // Build user prompt from context
      const userPrompt = this.buildUserPrompt(skill, context);

      // Create agent task
      const task: AgentTask = {
        id: `skill-${skill.metadata.name}-${Date.now()}`,
        provider: context.provider,
        owner: context.owner,
        repo: context.repo,
        prNumber: context.prNumber,
        skillName: skill.metadata.name,
        systemPrompt: skill.systemPrompt,
        userPrompt,
        tools: skill.metadata.tools,
      };

      const result = await this.agentCore.executeTask(task);

      // Update agent event
      await this.metadataStore.updateAgentEvent(agentEvent.id, {
        status: result.success ? 'completed' : 'failed',
        output: { response: result.response, toolsExecuted: result.toolsExecuted },
        tokensUsed: result.tokensUsed.input + result.tokensUsed.output,
        completedAt: new Date(),
        error: result.error,
      });

      this.logger.info({
        skillName: skill.metadata.name,
        success: result.success,
        turns: result.turns,
        tokensUsed: result.tokensUsed.input + result.tokensUsed.output,
      }, 'Skill execution completed');

      return {
        ...result,
        skillName: skill.metadata.name,
        context,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.metadataStore.updateAgentEvent(agentEvent.id, {
        status: 'failed',
        error: errorMessage,
        completedAt: new Date(),
      });

      this.logger.error({
        skillName: skill.metadata.name,
        error: errorMessage,
      }, 'Skill execution failed');

      return {
        taskId: '',
        skillName: skill.metadata.name,
        success: false,
        response: '',
        tokensUsed: { input: 0, output: 0 },
        toolsExecuted: [],
        turns: 0,
        error: errorMessage,
        context,
      };
    }
  }

  private buildUserPrompt(skill: ParsedSkill, context: SkillExecutionContext): string {
    const parts: string[] = [];

    parts.push(`Repository: ${context.owner}/${context.repo}`);
    parts.push(`Provider: ${context.provider}`);

    if (context.eventType) {
      parts.push(`Event: ${context.eventType}`);
    }

    if (context.prNumber) {
      parts.push(`Pull Request: #${context.prNumber}`);
    }

    if (context.issueNumber) {
      parts.push(`Issue: #${context.issueNumber}`);
    }

    if (context.branch) {
      parts.push(`Branch: ${context.branch}`);
    }

    if (context.commit) {
      parts.push(`Commit: ${context.commit}`);
    }

    if (context.eventPayload) {
      parts.push('\nEvent Payload:');
      parts.push('```json');
      parts.push(JSON.stringify(context.eventPayload, null, 2));
      parts.push('```');
    }

    return parts.join('\n');
  }

  async handleWebhookEvent(
    provider: GitProvider,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<SkillExecutionResult[]> {
    const skills = this.registry.findByWebhookEvent(provider, eventType);

    if (skills.length === 0) {
      this.logger.debug({ provider, eventType }, 'No skills matched webhook event');
      return [];
    }

    this.logger.info({
      provider,
      eventType,
      matchedSkills: skills.map(s => s.metadata.name),
    }, 'Found skills matching webhook event');

    // Extract context from payload
    const context = this.extractContextFromPayload(provider, eventType, payload);

    const results: SkillExecutionResult[] = [];

    for (const skill of skills) {
      const result = await this.executeSkill(skill, context);
      results.push(result);
    }

    return results;
  }

  private extractContextFromPayload(
    provider: GitProvider,
    eventType: string,
    payload: Record<string, unknown>
  ): SkillExecutionContext {
    // GitHub payload structure
    if (provider === 'github') {
      const repository = payload.repository as Record<string, unknown> | undefined;
      const pullRequest = payload.pull_request as Record<string, unknown> | undefined;
      const issue = payload.issue as Record<string, unknown> | undefined;

      const fullName = repository?.full_name as string | undefined;
      const parts = fullName?.split('/') || ['', ''];
      const owner = parts[0] || '';
      const repo = parts[1] || '';
      const prHead = pullRequest?.head as Record<string, unknown> | undefined;

      return {
        provider,
        owner,
        repo,
        eventType,
        eventPayload: payload,
        prNumber: pullRequest?.number as number | undefined,
        issueNumber: issue?.number as number | undefined,
        branch: prHead?.ref as string | undefined,
        commit: prHead?.sha as string | undefined,
      };
    }

    // GitLab payload structure
    if (provider === 'gitlab') {
      const project = payload.project as Record<string, unknown> | undefined;
      const mergeRequest = payload.merge_request as Record<string, unknown> | undefined;
      const issue = payload.issue as Record<string, unknown> | undefined;

      const pathWithNamespace = project?.path_with_namespace as string | undefined;
      const parts = pathWithNamespace?.split('/') || ['', ''];
      const owner = parts[0] || '';
      const repo = parts[1] || '';
      const lastCommit = mergeRequest?.last_commit as Record<string, unknown> | undefined;

      return {
        provider,
        owner,
        repo,
        eventType,
        eventPayload: payload,
        prNumber: mergeRequest?.iid as number | undefined,
        issueNumber: issue?.iid as number | undefined,
        branch: mergeRequest?.source_branch as string | undefined,
        commit: lastCommit?.id as string | undefined,
      };
    }

    // Bitbucket payload structure
    if (provider === 'bitbucket') {
      const repository = payload.repository as Record<string, unknown> | undefined;
      const pullrequest = payload.pullrequest as Record<string, unknown> | undefined;
      const issue = payload.issue as Record<string, unknown> | undefined;

      const fullName = repository?.full_name as string | undefined;
      const parts = fullName?.split('/') || ['', ''];
      const owner = parts[0] || '';
      const repo = parts[1] || '';
      const prSource = pullrequest?.source as Record<string, unknown> | undefined;
      const prBranch = prSource?.branch as Record<string, unknown> | undefined;
      const prCommit = prSource?.commit as Record<string, unknown> | undefined;

      return {
        provider,
        owner,
        repo,
        eventType,
        eventPayload: payload,
        prNumber: pullrequest?.id as number | undefined,
        issueNumber: issue?.id as number | undefined,
        branch: prBranch?.name as string | undefined,
        commit: prCommit?.hash as string | undefined,
      };
    }

    return {
      provider,
      owner: '',
      repo: '',
      eventType,
      eventPayload: payload,
    };
  }

  async executeByName(skillName: string, context: SkillExecutionContext): Promise<SkillExecutionResult | null> {
    const skill = this.registry.get(skillName);
    if (!skill) {
      this.logger.warn({ skillName }, 'Skill not found');
      return null;
    }

    return this.executeSkill(skill, context);
  }
}
