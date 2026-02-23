import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { type ServerConfig } from '../config/schema.js';
import { type MetadataStore } from '../storage/metadata.store.js';
import { type CacheStore } from '../storage/cache.store.js';
import { getLogger } from '../utils/logger.js';

export interface HttpServerDeps {
  config: ServerConfig;
  metadataStore: MetadataStore;
  cacheStore: CacheStore;
}

export class HttpServer {
  private server: FastifyInstance;
  private logger = getLogger('http-server');
  private deps: HttpServerDeps;

  constructor(deps: HttpServerDeps) {
    this.deps = deps;
    this.server = Fastify({
      logger: false,
    });

    this.setupRoutes();
  }

  private async setupMiddleware(): Promise<void> {
    await this.server.register(cors, {
      origin: true,
      credentials: true,
    });

    // Request logging
    this.server.addHook('onRequest', async (request) => {
      this.logger.debug({
        method: request.method,
        url: request.url,
        id: request.id,
      }, 'Incoming request');
    });

    this.server.addHook('onResponse', async (request, reply) => {
      this.logger.debug({
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      }, 'Request completed');
    });
  }

  private setupRoutes(): void {
    // Health check
    this.server.get('/health', async () => {
      const redisHealthy = await this.deps.cacheStore.ping();
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          redis: redisHealthy ? 'healthy' : 'unhealthy',
          database: 'healthy',
        },
      };
    });

    // API info
    this.server.get('/api', async () => {
      return {
        name: 'MegaSloth API',
        version: '1.0.0',
        description: 'AI-Powered Repository Operations Agent',
      };
    });

    // Repositories
    this.server.get('/api/repositories', async () => {
      const repos = await this.deps.metadataStore.listRepositories();
      return { repositories: repos };
    });

    this.server.get<{ Params: { id: string } }>('/api/repositories/:id', async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      const repo = await this.deps.metadataStore.getRepository(id);
      if (!repo) {
        return reply.status(404).send({ error: 'Repository not found' });
      }
      return { repository: repo };
    });

    this.server.post<{ Body: { provider: string; owner: string; name: string; defaultBranch?: string } }>(
      '/api/repositories',
      async (request, reply) => {
        const { provider, owner, name, defaultBranch } = request.body;

        if (!['github', 'gitlab', 'bitbucket'].includes(provider)) {
          return reply.status(400).send({ error: 'Invalid provider' });
        }

        const fullName = `${owner}/${name}`;
        const existing = await this.deps.metadataStore.getRepositoryByFullName(provider, fullName);
        if (existing) {
          return reply.status(409).send({ error: 'Repository already exists', repository: existing });
        }

        const repo = await this.deps.metadataStore.createRepository({
          provider: provider as 'github' | 'gitlab' | 'bitbucket',
          owner,
          name,
          fullName,
          defaultBranch: defaultBranch || 'main',
        });

        return reply.status(201).send({ repository: repo });
      }
    );

    // Pull Requests
    this.server.get<{ Params: { repoId: string } }>('/api/repositories/:repoId/pull-requests', async (request, reply) => {
      const repoId = parseInt(request.params.repoId, 10);
      const repo = await this.deps.metadataStore.getRepository(repoId);
      if (!repo) {
        return reply.status(404).send({ error: 'Repository not found' });
      }

      const prs = await this.deps.metadataStore.listOpenPullRequests(repoId);
      return { pullRequests: prs };
    });

    // Agent Events
    this.server.get<{ Querystring: { repositoryId?: string; limit?: string } }>(
      '/api/events',
      async (request) => {
        const repositoryId = request.query.repositoryId ? parseInt(request.query.repositoryId, 10) : undefined;
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 100;
        const events = await this.deps.metadataStore.listAgentEvents(repositoryId, limit);
        return { events };
      }
    );

    // Scheduled Jobs
    this.server.get('/api/jobs', async () => {
      const jobs = await this.deps.metadataStore.listActiveScheduledJobs();
      return { jobs };
    });

    // Stats
    this.server.get('/api/stats', async () => {
      const repos = await this.deps.metadataStore.listRepositories();
      const events = await this.deps.metadataStore.listAgentEvents(undefined, 1000);

      const completedEvents = events.filter(e => e.status === 'completed');
      const failedEvents = events.filter(e => e.status === 'failed');
      const totalTokens = completedEvents.reduce((sum, e) => sum + (e.tokensUsed || 0), 0);

      return {
        repositories: repos.length,
        totalEvents: events.length,
        completedEvents: completedEvents.length,
        failedEvents: failedEvents.length,
        totalTokensUsed: totalTokens,
      };
    });
  }

  async start(): Promise<void> {
    await this.setupMiddleware();
    const { httpPort: port, host } = this.deps.config;
    await this.server.listen({ port, host });
    this.logger.info({ port, host }, 'HTTP server started');
  }

  async stop(): Promise<void> {
    await this.server.close();
    this.logger.info('HTTP server stopped');
  }

  getServer(): FastifyInstance {
    return this.server;
  }
}
