import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { type ServerConfig } from '../config/schema.js';
import { type MetadataStore } from '../storage/metadata.store.js';
import { type CacheStore } from '../storage/cache.store.js';
import { type LLMProvider, type Message } from '../providers/types.js';
import { AgentCore, type AgentCoreDeps, type ChatTask, type AgentEventCallbacks } from '../agent/core.js';
import { type GitAdapterConfigs } from '../adapters/git/index.js';
import { getLogger } from '../utils/logger.js';
import { randomUUID } from 'node:crypto';

export interface HttpServerDeps {
  config: ServerConfig;
  metadataStore: MetadataStore;
  cacheStore: CacheStore;
}

export class HttpServer {
  private server: FastifyInstance;
  private logger = getLogger('http-server');
  private deps: HttpServerDeps;
  private chatHistory: Message[] = [];
  private chatProvider: LLMProvider | null = null;
  private agentCore: AgentCore | null = null;
  private chatSessions: Map<string, string> = new Map();

  constructor(deps: HttpServerDeps) {
    this.deps = deps;
    this.server = Fastify({
      logger: false,
    });

    this.setupRoutes();
  }

  private async getChatProvider(): Promise<LLMProvider> {
    if (this.chatProvider) return this.chatProvider;
    const { createLLMProvider } = await import('../providers/factory.js');
    const { loadConfig } = await import('../config/index.js');
    const config = loadConfig();
    const apiKey = config.llm?.apiKey || config.anthropic?.apiKey;
    if (!apiKey) throw new Error('No LLM API key configured. Set LLM_API_KEY or ANTHROPIC_API_KEY.');
    this.chatProvider = createLLMProvider({
      provider: config.llm?.provider || 'claude',
      apiKey,
      model: config.llm?.model,
      maxTokens: config.llm?.maxTokens,
    });
    return this.chatProvider;
  }

  private async getAgentCore(): Promise<AgentCore> {
    if (this.agentCore) return this.agentCore;

    const { loadConfig } = await import('../config/index.js');
    const config = loadConfig();
    const apiKey = config.llm?.apiKey || config.anthropic?.apiKey;
    if (!apiKey) throw new Error('No LLM API key configured.');

    await import('../adapters/git/index.js');
    const gitConfigs: Record<string, unknown> = {};
    if (config.github?.token) gitConfigs.github = { token: config.github.token };
    if (config.gitlab?.token) gitConfigs.gitlab = { token: config.gitlab.token, url: config.gitlab.url };
    if (config.bitbucket?.username) gitConfigs.bitbucket = { username: config.bitbucket.username, appPassword: config.bitbucket.appPassword };

    const deps: AgentCoreDeps = {
      llmConfig: {
        provider: config.llm?.provider || 'claude',
        apiKey,
        model: config.llm?.model,
        maxTokens: config.llm?.maxTokens,
      },
      gitAdapterConfigs: gitConfigs as unknown as GitAdapterConfigs,
      metadataStore: this.deps.metadataStore,
    };

    this.agentCore = new AgentCore(deps);
    return this.agentCore;
  }

  private sendSSE(reply: FastifyReply, event: string, data: unknown): void {
    reply.raw.write(`data: ${JSON.stringify({ type: event, ...data as object })}\n\n`);
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

    // ── Chat (SSE Streaming + Agent Loop) ──

    this.server.post<{ Body: { message: string; sessionId?: string; stream?: boolean } }>(
      '/api/chat',
      async (request, reply) => {
        const { message, sessionId: clientSessionId, stream = true } = request.body;
        if (!message?.trim()) {
          return reply.status(400).send({ error: 'Message is required' });
        }

        const sessionId = clientSessionId || this.getOrCreateSession(request.ip || 'default');

        if (!stream) {
          return this.handleNonStreamingChat(message, reply);
        }

        try {
          const agent = await this.getAgentCore();

          reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Session-Id': sessionId,
          });

          const callbacks: AgentEventCallbacks = {
            onTextDelta: (text) => this.sendSSE(reply, 'text_delta', { text }),
            onToolStart: (tool, input) => this.sendSSE(reply, 'tool_start', { tool, input }),
            onToolDone: (tool, result, durationMs, isError) =>
              this.sendSSE(reply, 'tool_done', { tool, result, durationMs, isError }),
            onToolBlocked: (tool, reason) => this.sendSSE(reply, 'tool_blocked', { tool, reason }),
            onTurnComplete: (turn, tokenUsage) =>
              this.sendSSE(reply, 'turn_complete', { turn, usage: tokenUsage }),
            onError: (error) => this.sendSSE(reply, 'error', { error }),
            onDone: (result) => {
              this.sendSSE(reply, 'done', {
                response: result.response,
                toolsExecuted: result.toolsExecuted,
                turns: result.turns,
                usage: result.tokensUsed,
              });
              reply.raw.end();
            },
          };

          const chatTask: ChatTask = {
            sessionId,
            message,
            toolCategories: ['shell', 'filesystem', 'code', 'git', 'web', 'memory'],
          };

          await agent.executeChatTask(chatTask, callbacks);
          return;
        } catch (error) {
          this.logger.error({ error }, 'SSE Chat request failed');
          const errorMsg = error instanceof Error ? error.message : 'Chat failed';
          try {
            this.sendSSE(reply, 'error', { error: errorMsg });
            reply.raw.end();
            return;
          } catch {
            return reply.status(500).send({ error: errorMsg });
          }
        }
      }
    );

    this.server.delete<{ Body?: { sessionId?: string } }>('/api/chat', async (request) => {
      const sessionId = (request.body as { sessionId?: string } | undefined)?.sessionId;
      if (sessionId) {
        try {
          const agent = await this.getAgentCore();
          await agent.clearChatSession(sessionId);
        } catch { /* ignore */ }
      }
      this.chatHistory = [];
      return { message: 'Chat history cleared' };
    });

    this.server.post<{ Body: { sessionId: string } }>('/api/chat/compact', async (request, reply) => {
      const { sessionId } = request.body;
      if (!sessionId) {
        return reply.status(400).send({ error: 'sessionId is required' });
      }
      try {
        const agent = await this.getAgentCore();
        const llm = agent.getLLMProvider();
        const { ContextManager } = await import('../agent/context-manager.js');
        const ctxManager = new ContextManager(this.deps.metadataStore);
        const result = await ctxManager.compactContext(
          { contextKey: `chat:${sessionId}`, maxMessages: 100, expirationHours: 48 },
          llm
        );
        if (!result) {
          return { message: 'Nothing to compact', compacted: false };
        }
        return { message: 'Context compacted', compacted: true, ...result };
      } catch (error) {
        return reply.status(500).send({ error: error instanceof Error ? error.message : 'Compaction failed' });
      }
    });

    // ── Skill execution from chat ──

    this.server.post<{ Body: { skill: string; owner?: string; repo?: string; prNumber?: number } }>(
      '/api/chat/skill',
      async (request, reply) => {
        const { skill, owner, repo, prNumber } = request.body;
        if (!skill) {
          return reply.status(400).send({ error: 'skill name is required' });
        }

        try {
          const { SkillRegistry } = await import('../skills/registry.js');
          const { join } = await import('node:path');

          const registry = new SkillRegistry();

          const builtinDir = join(process.cwd(), 'src', 'skills', 'builtin');
          const customDir = join(process.cwd(), '.megasloth', 'skills');
          registry.loadFromDirectory(builtinDir);
          registry.loadFromDirectory(customDir);

          const found = registry.get(skill);
          if (!found) {
            const available = registry.listSkills().map(s => s.name);
            return reply.status(404).send({
              error: `Skill "${skill}" not found`,
              available,
            });
          }

          if (!owner || !repo) {
            return reply.status(400).send({
              error: 'owner and repo are required for skill execution',
              skill: found.metadata.name,
              description: found.metadata.description,
            });
          }

          const agent = await this.getAgentCore();
          const providers = agent.listProviders();
          const provider = providers[0];
          if (!provider) {
            return reply.status(400).send({ error: 'No Git provider configured' });
          }

          reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });

          this.sendSSE(reply, 'skill_start', { skill: found.metadata.name, description: found.metadata.description });

          const { SkillEngine } = await import('../skills/engine.js');
          const engine = new SkillEngine(agent, this.deps.metadataStore);
          engine.getRegistry().loadFromDirectory(builtinDir);
          engine.getRegistry().loadFromDirectory(customDir);

          const result = await engine.executeSkill(found, {
            provider,
            owner,
            repo,
            prNumber,
            eventType: 'manual',
          });

          this.sendSSE(reply, 'skill_done', {
            skill: found.metadata.name,
            success: result.success,
            response: result.response,
            toolsExecuted: result.toolsExecuted,
            turns: result.turns,
            usage: result.tokensUsed,
          });
          reply.raw.end();
        } catch (error) {
          this.logger.error({ error, skill }, 'Skill execution failed');
          try {
            this.sendSSE(reply, 'error', { error: error instanceof Error ? error.message : 'Skill execution failed' });
            reply.raw.end();
          } catch {
            return reply.status(500).send({ error: 'Skill execution failed' });
          }
        }
      }
    );

    // ── Config CRUD ──

    this.server.get('/api/config', async () => {
      const { loadConfig } = await import('../config/index.js');
      const config = loadConfig();
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

      try {
        const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
        const { stringify: stringifyYaml, parse: parseYaml } = await import('yaml');

        const configPath = '.megasloth/config.yaml';
        let existingConfig: Record<string, unknown> = {};
        if (existsSync(configPath)) {
          existingConfig = parseYaml(readFileSync(configPath, 'utf-8')) || {};
        }

        const merged = { ...existingConfig, ...updates };
        writeFileSync(configPath, stringifyYaml(merged), 'utf-8');

        const { reloadConfig } = await import('../config/index.js');
        reloadConfig();

        return reply.status(200).send({ message: 'Configuration updated and saved', applied: Object.keys(updates) });
      } catch (error) {
        this.logger.error({ error }, 'Failed to save config');
        return reply.status(500).send({ error: 'Failed to save configuration' });
      }
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

        try {
          const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
          const { join } = await import('node:path');

          const dirs = [
            join(process.cwd(), 'src', 'skills', 'builtin', name),
            join(process.cwd(), '.megasloth', 'skills', name),
          ];
          let skillFile: string | null = null;
          for (const dir of dirs) {
            const candidate = join(dir, 'SKILL.md');
            if (existsSync(candidate)) { skillFile = candidate; break; }
          }

          if (!skillFile) {
            return reply.status(404).send({ error: `Skill "${name}" not found` });
          }

          const content = readFileSync(skillFile, 'utf-8');
          const updated = content.replace(
            /^(enabled:\s*)(true|false)/m,
            `$1${enabled}`
          );
          writeFileSync(skillFile, updated, 'utf-8');

          return reply.status(200).send({ skill: name, enabled, message: `Skill ${name} ${enabled ? 'enabled' : 'disabled'}` });
        } catch (error) {
          this.logger.error({ error, skill: name }, 'Failed to toggle skill');
          return reply.status(500).send({ error: 'Failed to toggle skill' });
        }
      }
    );

    // ── Providers ──

    this.server.get('/api/providers', async () => {
      const { AVAILABLE_MODELS } = await import('../providers/types.js');
      const providers = [
        { name: 'claude', displayName: 'Anthropic Claude', models: AVAILABLE_MODELS.claude.map(m => m.id), configured: !!process.env.ANTHROPIC_API_KEY },
        { name: 'openai', displayName: 'OpenAI', models: AVAILABLE_MODELS.openai.map(m => m.id), configured: !!process.env.OPENAI_API_KEY },
        { name: 'gemini', displayName: 'Google Gemini', models: AVAILABLE_MODELS.gemini.map(m => m.id), configured: !!process.env.GEMINI_API_KEY },
      ];
      const active = process.env.LLM_PROVIDER || 'claude';
      return { providers, active };
    });

    this.server.post<{ Body: { provider: string; apiKey?: string } }>('/api/providers/test', async (request, reply) => {
      const { provider, apiKey: providedKey } = request.body;
      const envKeyMap: Record<string, string | undefined> = {
        claude: process.env.ANTHROPIC_API_KEY,
        openai: process.env.OPENAI_API_KEY,
        gemini: process.env.GEMINI_API_KEY,
      };
      const apiKey = (providedKey && providedKey !== 'test') ? providedKey : envKeyMap[provider];
      if (!apiKey) {
        return reply.status(400).send({ valid: false, provider, error: `No API key configured for ${provider}` });
      }
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

  private getOrCreateSession(clientId: string): string {
    const existing = this.chatSessions.get(clientId);
    if (existing) return existing;
    const sessionId = randomUUID();
    this.chatSessions.set(clientId, sessionId);
    return sessionId;
  }

  private async handleNonStreamingChat(message: string, reply: FastifyReply): Promise<unknown> {
    try {
      const provider = await this.getChatProvider();
      this.chatHistory.push({ role: 'user', content: message });
      const historySlice = this.chatHistory.slice(-30);
      const response = await provider.chat(historySlice, {
        system: 'You are MegaSloth, an AI-powered repository operations agent. Be concise and helpful.',
        maxTokens: 4096,
      });
      this.chatHistory.push({ role: 'assistant', content: response.textContent });
      return {
        response: response.textContent,
        toolsUsed: response.toolUses.map(t => t.name),
        usage: response.usage,
      };
    } catch (error) {
      this.logger.error({ error }, 'Non-streaming chat failed');
      return reply.status(500).send({ error: error instanceof Error ? error.message : 'Chat failed' });
    }
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
