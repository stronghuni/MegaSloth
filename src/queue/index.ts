import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { type RedisConfig } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

export interface JobData {
  type: 'webhook' | 'skill' | 'scheduled';
  payload: Record<string, unknown>;
}

export interface JobResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export type JobProcessor = (job: Job<JobData>) => Promise<JobResult>;

export class JobQueue {
  private queue: Queue<JobData, JobResult>;
  private worker: Worker<JobData, JobResult> | null = null;
  private logger = getLogger('job-queue');
  private connection: ConnectionOptions;

  constructor(config: RedisConfig, queueName = 'megasloth') {
    // Parse Redis URL for connection options
    const url = new URL(config.url);
    this.connection = {
      host: url.hostname,
      port: parseInt(url.port || '6379', 10),
      password: url.password || undefined,
    };

    this.queue = new Queue(queueName, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          count: 1000,
        },
        removeOnFail: {
          count: 5000,
        },
      },
    });

    this.logger.info({ queueName }, 'Job queue initialized');
  }

  async addJob(data: JobData, options?: { priority?: number; delay?: number }): Promise<Job<JobData, JobResult>> {
    const job = await this.queue.add(data.type, data, {
      priority: options?.priority,
      delay: options?.delay,
    });

    this.logger.debug({
      jobId: job.id,
      type: data.type,
    }, 'Job added to queue');

    return job;
  }

  async addWebhookJob(payload: Record<string, unknown>): Promise<Job<JobData, JobResult>> {
    return this.addJob({
      type: 'webhook',
      payload,
    });
  }

  async addSkillJob(
    skillName: string,
    context: Record<string, unknown>,
    options?: { priority?: number }
  ): Promise<Job<JobData, JobResult>> {
    return this.addJob({
      type: 'skill',
      payload: { skillName, context },
    }, options);
  }

  async addScheduledJob(
    jobName: string,
    payload: Record<string, unknown>
  ): Promise<Job<JobData, JobResult>> {
    return this.addJob({
      type: 'scheduled',
      payload: { jobName, ...payload },
    });
  }

  startWorker(processor: JobProcessor, concurrency = 5): void {
    if (this.worker) {
      this.logger.warn('Worker already running');
      return;
    }

    this.worker = new Worker<JobData, JobResult>(
      this.queue.name,
      async (job) => {
        this.logger.info({
          jobId: job.id,
          type: job.data.type,
          attempt: job.attemptsMade + 1,
        }, 'Processing job');

        try {
          const result = await processor(job);

          if (result.success) {
            this.logger.info({
              jobId: job.id,
              type: job.data.type,
            }, 'Job completed successfully');
          } else {
            this.logger.warn({
              jobId: job.id,
              type: job.data.type,
              error: result.error,
            }, 'Job completed with error');
          }

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error({
            jobId: job.id,
            type: job.data.type,
            error: errorMessage,
          }, 'Job processing failed');
          throw error;
        }
      },
      {
        connection: this.connection,
        concurrency,
      }
    );

    this.worker.on('ready', () => {
      this.logger.info({ concurrency }, 'Worker ready');
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error({
        jobId: job?.id,
        type: job?.data.type,
        error: error.message,
      }, 'Job failed after all retries');
    });

    this.worker.on('error', (error) => {
      this.logger.error({ error: error.message }, 'Worker error');
    });
  }

  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      this.logger.info('Worker stopped');
    }
  }

  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  async getJob(jobId: string): Promise<Job<JobData, JobResult> | undefined> {
    return this.queue.getJob(jobId);
  }

  async retryJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.retry();
      this.logger.info({ jobId }, 'Job retried');
    }
  }

  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
    this.logger.info('Queue closed');
  }
}
