import { Cron } from 'croner';
import { type SkillEngine } from '../skills/engine.js';
import { type JobQueue } from '../queue/index.js';
import { type MetadataStore } from '../storage/index.js';
import { getLogger } from '../utils/logger.js';

export interface SchedulerDeps {
  skillEngine: SkillEngine;
  jobQueue: JobQueue;
  metadataStore: MetadataStore;
}

export interface ScheduledJobConfig {
  name: string;
  cron: string;
  skillName: string;
  repositoryId?: number;
  config?: Record<string, unknown>;
}

export class Scheduler {
  private jobs: Map<string, Cron> = new Map();
  private deps: SchedulerDeps;
  private logger = getLogger('scheduler');

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
  }

  async initialize(): Promise<void> {
    // Load jobs from skill cron triggers
    const cronSkills = this.deps.skillEngine.getRegistry().findByCronSchedule();

    for (const skill of cronSkills) {
      const cronTriggers = skill.metadata.triggers
        .filter(t => t.type === 'cron' && t.cron)
        .map(t => t.cron!);

      for (const cron of cronTriggers) {
        this.scheduleJob({
          name: `${skill.metadata.name}-cron`,
          cron,
          skillName: skill.metadata.name,
        });
      }
    }

    // Load custom jobs from database
    const storedJobs = await this.deps.metadataStore.listActiveScheduledJobs();
    for (const job of storedJobs) {
      if (job.skillName) {
        this.scheduleJob({
          name: job.name,
          cron: job.cronExpression,
          skillName: job.skillName,
          repositoryId: job.repositoryId || undefined,
          config: job.config as Record<string, unknown> | undefined,
        });
      }
    }

    this.logger.info({ jobCount: this.jobs.size }, 'Scheduler initialized');
  }

  scheduleJob(config: ScheduledJobConfig): void {
    // Stop existing job if any
    this.stopJob(config.name);

    const job = new Cron(config.cron, {
      name: config.name,
      catch: (error) => {
        this.logger.error({
          jobName: config.name,
          error: error instanceof Error ? error.message : String(error),
        }, 'Scheduled job error');
      },
    }, async () => {
      this.logger.info({ jobName: config.name }, 'Executing scheduled job');

      try {
        // Add job to queue for processing
        await this.deps.jobQueue.addScheduledJob(config.skillName, {
          jobName: config.name,
          skillName: config.skillName,
          repositoryId: config.repositoryId,
          ...config.config,
        });

        // Update last run time
        const storedJob = await this.deps.metadataStore.getScheduledJob(config.name);
        if (storedJob) {
          await this.deps.metadataStore.updateScheduledJob(storedJob.id, {
            lastRunAt: new Date(),
            nextRunAt: job.nextRun() || undefined,
          });
        }
      } catch (error) {
        this.logger.error({
          jobName: config.name,
          error: error instanceof Error ? error.message : String(error),
        }, 'Failed to queue scheduled job');
      }
    });

    this.jobs.set(config.name, job);

    this.logger.info({
      jobName: config.name,
      cron: config.cron,
      nextRun: job.nextRun()?.toISOString(),
    }, 'Job scheduled');
  }

  stopJob(name: string): boolean {
    const job = this.jobs.get(name);
    if (job) {
      job.stop();
      this.jobs.delete(name);
      this.logger.info({ jobName: name }, 'Job stopped');
      return true;
    }
    return false;
  }

  pauseJob(name: string): boolean {
    const job = this.jobs.get(name);
    if (job) {
      job.pause();
      this.logger.info({ jobName: name }, 'Job paused');
      return true;
    }
    return false;
  }

  resumeJob(name: string): boolean {
    const job = this.jobs.get(name);
    if (job) {
      job.resume();
      this.logger.info({ jobName: name }, 'Job resumed');
      return true;
    }
    return false;
  }

  listJobs(): Array<{
    name: string;
    nextRun: Date | null;
    isRunning: boolean;
    isPaused: boolean;
  }> {
    return Array.from(this.jobs.entries()).map(([name, job]) => ({
      name,
      nextRun: job.nextRun(),
      isRunning: job.isBusy(),
      isPaused: job.isStopped(),
    }));
  }

  getJob(name: string): Cron | undefined {
    return this.jobs.get(name);
  }

  async stop(): Promise<void> {
    for (const [name, job] of this.jobs) {
      job.stop();
      this.logger.debug({ jobName: name }, 'Job stopped');
    }
    this.jobs.clear();
    this.logger.info('Scheduler stopped');
  }
}
