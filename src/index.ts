import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { loadConfig, type Config } from './config/index.js';
import { initLogger, getLogger } from './utils/logger.js';
import { MetadataStore, CacheStore } from './storage/index.js';
import { HttpServer, WebhookServer, WebSocketServer, type WebhookEvent } from './gateway/index.js';
import { createAgentCore, type AgentCore } from './agent/index.js';
import { SkillEngine } from './skills/index.js';
import { JobQueue, type JobData, type JobResult } from './queue/index.js';
import { createJobProcessor } from './queue/worker.js';
import { Scheduler } from './scheduler/index.js';
import { SlackAdapter } from './adapters/notifications/index.js';

export interface MegaSloth {
  config: Config;
  metadataStore: MetadataStore;
  cacheStore: CacheStore;
  httpServer: HttpServer;
  webhookServer: WebhookServer;
  websocketServer: WebSocketServer;
  agentCore: AgentCore;
  skillEngine: SkillEngine;
  jobQueue: JobQueue;
  scheduler: Scheduler;
  slackAdapter: SlackAdapter;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createMegaSloth(): Promise<MegaSloth> {
  const config = loadConfig();

  const logger = initLogger(config.logging);
  logger.info('Starting MegaSloth...');

  const dataDir = '.megasloth/data';
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Initialize storage
  const metadataStore = new MetadataStore(config.database);
  const cacheStore = new CacheStore(config.redis);

  // Initialize agent core
  const agentCore = createAgentCore({
    anthropicConfig: config.anthropic,
    gitAdapterConfigs: {
      github: config.github,
      gitlab: config.gitlab,
      bitbucket: config.bitbucket,
    },
    metadataStore,
  });

  // Initialize skill engine
  const skillEngine = new SkillEngine(agentCore, metadataStore);

  // Load built-in skills
  const builtinSkillsDir = join(import.meta.dirname, 'skills', 'builtin');
  if (existsSync(builtinSkillsDir)) {
    skillEngine.loadSkills(builtinSkillsDir);
  }

  // Load custom skills
  const customSkillsDir = '.megasloth/skills';
  if (existsSync(customSkillsDir)) {
    skillEngine.loadSkills(customSkillsDir);
  }

  // Initialize job queue
  const jobQueue = new JobQueue(config.redis);

  // Initialize scheduler
  const scheduler = new Scheduler({
    skillEngine,
    jobQueue,
    metadataStore,
  });

  // Initialize Slack adapter
  const slackAdapter = new SlackAdapter({
    config: config.slack,
    metadataStore,
  });

  // Initialize gateway servers
  const httpServer = new HttpServer({
    config: config.server,
    metadataStore,
    cacheStore,
  });

  const webhookServer = new WebhookServer({
    config: config.server,
    githubConfig: config.github,
    gitlabConfig: config.gitlab,
    bitbucketConfig: config.bitbucket,
    metadataStore,
    onEvent: async (event: WebhookEvent) => {
      // Add webhook events to the job queue
      await jobQueue.addWebhookJob(event as unknown as Record<string, unknown>);

      // Notify WebSocket clients
      websocketServer.notifyWebhookReceived(event.provider, event.eventType);
    },
  });

  const websocketServer = new WebSocketServer({
    config: config.server,
  });

  // Create job processor
  const jobProcessor = createJobProcessor({ skillEngine });

  async function start(): Promise<void> {
    logger.info('Starting all services...');

    // Start job queue worker
    jobQueue.startWorker(jobProcessor);

    // Initialize scheduler
    await scheduler.initialize();

    // Start servers
    await Promise.all([
      httpServer.start(),
      webhookServer.start(),
      websocketServer.start(),
    ]);

    logger.info({
      httpPort: config.server.httpPort,
      webhookPort: config.server.webhookPort,
      websocketPort: config.server.websocketPort,
      providers: agentCore.listProviders(),
      skills: skillEngine.getRegistry().listSkills().length,
    }, 'MegaSloth started successfully');
  }

  async function stop(): Promise<void> {
    logger.info('Shutting down MegaSloth...');

    await scheduler.stop();
    await jobQueue.close();
    await Promise.all([
      httpServer.stop(),
      webhookServer.stop(),
      websocketServer.stop(),
    ]);
    await cacheStore.close();
    metadataStore.close();

    logger.info('MegaSloth stopped');
  }

  return {
    config,
    metadataStore,
    cacheStore,
    httpServer,
    webhookServer,
    websocketServer,
    agentCore,
    skillEngine,
    jobQueue,
    scheduler,
    slackAdapter,
    start,
    stop,
  };
}

// Main entry point
async function main(): Promise<void> {
  const logger = getLogger('main');

  try {
    const bot = await createMegaSloth();

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');
      await bot.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    await bot.start();
  } catch (error) {
    logger.fatal({ error }, 'Failed to start MegaSloth');
    process.exit(1);
  }
}

main();
