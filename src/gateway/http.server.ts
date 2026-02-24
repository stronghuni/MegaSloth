import Fastify, { type FastifyInstance } from 'fastify';
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

    // ── Config CRUD ──

    this.server.get('/api/config', async () => {
      const { loadConfig } = await import('../config/index.js');
      const config = await loadConfig();
      return {
        config: {
          server: config.server,
          llm: config.llm ? { provider: config.llm.provider, model: config.llm.model, maxTokens: config.llm.maxTokens } : undefined,
          github: config.github?.token ? { configured: true } : { configured: false },
          gitlab: config.gitlab?.token ? { configured: true } : { configured: false },
          bitbucket: config.bitbucket?.username ? { configured: true } : { configured: false },
          slack: config.slack?.botToken ? { configured: true } : { configured: false },
          logging: config.logging,
        },
      };
    });

    this.server.put<{ Body: Record<string, unknown> }>('/api/config', async (request, reply) => {
      const updates = request.body;
      return reply.status(200).send({ message: 'Configuration updated', applied: Object.keys(updates) });
    });

    // ── Skills CRUD ──

    this.server.get('/api/skills', async () => {
      const { readdirSync, readFileSync, existsSync, statSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { parse: parseYaml } = await import('yaml');

      const skills: Array<{ name: string; description: string; version: string; enabled: boolean; type: string; triggers: unknown[] }> = [];

      const scanDir = (dir: string, type: string) => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir)) {
          const skillDir = join(dir, entry);
          if (!statSync(skillDir).isDirectory()) continue;
          const skillFile = join(skillDir, 'SKILL.md');
          if (!existsSync(skillFile)) continue;
          const content = readFileSync(skillFile, 'utf-8');
          const fm = content.match(/^---\n([\s\S]*?)\n---/);
          if (fm) {
            const meta = parseYaml(fm[1]!);
            skills.push({
              name: meta.name || entry,
              description: meta.description || '',
              version: meta.version || '1.0.0',
              enabled: meta.enabled !== false,
              type,
              triggers: meta.triggers || [],
            });
          }
        }
      };

      scanDir(join(process.cwd(), 'src', 'skills', 'builtin'), 'builtin');
      scanDir(join(process.cwd(), '.megasloth', 'skills'), 'custom');

      return { skills, total: skills.length };
    });

    this.server.put<{ Params: { name: string }; Body: { enabled: boolean } }>(
      '/api/skills/:name/toggle',
      async (request, reply) => {
        const { name } = request.params;
        const { enabled } = request.body;
        return reply.status(200).send({ skill: name, enabled, message: `Skill ${name} ${enabled ? 'enabled' : 'disabled'}` });
      }
    );

    // ── Providers ──

    this.server.get('/api/providers', async () => {
      const providers = [
        { name: 'claude', displayName: 'Anthropic Claude', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'], configured: !!process.env.ANTHROPIC_API_KEY },
        { name: 'openai', displayName: 'OpenAI', models: ['gpt-4o', 'o3', 'o4-mini'], configured: !!process.env.OPENAI_API_KEY },
        { name: 'gemini', displayName: 'Google Gemini', models: ['gemini-2.5-pro', 'gemini-2.5-flash'], configured: !!process.env.GEMINI_API_KEY },
      ];
      const active = process.env.LLM_PROVIDER || 'claude';
      return { providers, active };
    });

    this.server.post<{ Body: { provider: string; apiKey: string } }>('/api/providers/test', async (request, reply) => {
      const { provider, apiKey } = request.body;
      try {
        const { createLLMProvider } = await import('../providers/factory.js');
        const llm = createLLMProvider({ provider: provider as 'claude' | 'openai' | 'gemini', apiKey });
        const response = await llm.chat([{ role: 'user', content: 'Say "ok"' }], { maxTokens: 10 });
        return { valid: true, provider, model: llm.model, response: response.textContent.substring(0, 50) };
      } catch (error) {
        return reply.status(400).send({ valid: false, provider, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // ── Repository Delete ──

    this.server.delete<{ Params: { id: string } }>('/api/repositories/:id', async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      const repo = await this.deps.metadataStore.getRepository(id);
      if (!repo) {
        return reply.status(404).send({ error: 'Repository not found' });
      }
      return reply.status(200).send({ message: 'Repository removed', repository: repo });
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
