import { type Job } from 'bullmq';
import { type JobData, type JobResult } from './index.js';
import { type SkillEngine, type SkillExecutionContext } from '../skills/engine.js';
import { type GitProvider } from '../adapters/git/types.js';
import { type WebhookEvent } from '../gateway/webhook.server.js';
import { getLogger } from '../utils/logger.js';

export interface WorkerHandlerDeps {
  skillEngine: SkillEngine;
}

export function createJobProcessor(deps: WorkerHandlerDeps) {
  const logger = getLogger('job-processor');

  return async (job: Job<JobData>): Promise<JobResult> => {
    switch (job.data.type) {
      case 'webhook':
        return handleWebhookJob(job.data.payload as unknown as WebhookEvent, deps, logger);

      case 'skill':
        return handleSkillJob(job.data.payload as { skillName: string; context: SkillExecutionContext }, deps, logger);

      case 'scheduled':
        return handleScheduledJob(job.data.payload as { jobName: string; [key: string]: unknown }, deps, logger);

      default:
        logger.warn({ type: job.data.type }, 'Unknown job type');
        return { success: false, error: 'Unknown job type' };
    }
  };
}

async function handleWebhookJob(
  event: WebhookEvent,
  deps: WorkerHandlerDeps,
  logger: ReturnType<typeof getLogger>
): Promise<JobResult> {
  logger.debug({
    provider: event.provider,
    eventType: event.eventType,
  }, 'Processing webhook job');

  try {
    const results = await deps.skillEngine.handleWebhookEvent(
      event.provider as GitProvider,
      event.eventType,
      event.payload as Record<string, unknown>
    );

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info({
      provider: event.provider,
      eventType: event.eventType,
      skillsExecuted: results.length,
      successCount,
      failCount,
    }, 'Webhook job completed');

    return {
      success: failCount === 0,
      result: {
        skillsExecuted: results.map(r => r.skillName),
        successCount,
        failCount,
      },
      error: failCount > 0 ? `${failCount} skill(s) failed` : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({
      provider: event.provider,
      eventType: event.eventType,
      error: errorMessage,
    }, 'Webhook job failed');

    return { success: false, error: errorMessage };
  }
}

async function handleSkillJob(
  payload: { skillName: string; context: SkillExecutionContext },
  deps: WorkerHandlerDeps,
  logger: ReturnType<typeof getLogger>
): Promise<JobResult> {
  logger.debug({
    skillName: payload.skillName,
    repo: `${payload.context.owner}/${payload.context.repo}`,
  }, 'Processing skill job');

  try {
    const result = await deps.skillEngine.executeByName(payload.skillName, payload.context);

    if (!result) {
      return { success: false, error: `Skill not found: ${payload.skillName}` };
    }

    logger.info({
      skillName: payload.skillName,
      success: result.success,
      tokensUsed: result.tokensUsed.input + result.tokensUsed.output,
    }, 'Skill job completed');

    return {
      success: result.success,
      result: {
        response: result.response,
        toolsExecuted: result.toolsExecuted,
        turns: result.turns,
      },
      error: result.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({
      skillName: payload.skillName,
      error: errorMessage,
    }, 'Skill job failed');

    return { success: false, error: errorMessage };
  }
}

async function handleScheduledJob(
  payload: { jobName: string; [key: string]: unknown },
  deps: WorkerHandlerDeps,
  logger: ReturnType<typeof getLogger>
): Promise<JobResult> {
  logger.debug({ jobName: payload.jobName }, 'Processing scheduled job');

  try {
    // Find the skill associated with this scheduled job
    const skills = deps.skillEngine.getRegistry().findByCronSchedule();
    const skill = skills.find(s => s.metadata.name === payload.jobName);

    if (!skill) {
      return { success: false, error: `Skill not found for scheduled job: ${payload.jobName}` };
    }

    // Extract context from payload
    const context: SkillExecutionContext = {
      provider: (payload.provider as GitProvider) || 'github',
      owner: (payload.owner as string) || '',
      repo: (payload.repo as string) || '',
      eventType: 'scheduled',
    };

    const result = await deps.skillEngine.executeSkill(skill, context);

    logger.info({
      jobName: payload.jobName,
      success: result.success,
    }, 'Scheduled job completed');

    return {
      success: result.success,
      result: {
        response: result.response,
        toolsExecuted: result.toolsExecuted,
      },
      error: result.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({
      jobName: payload.jobName,
      error: errorMessage,
    }, 'Scheduled job failed');

    return { success: false, error: errorMessage };
  }
}
