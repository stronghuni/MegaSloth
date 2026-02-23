import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, desc, sql } from 'drizzle-orm';
import * as schema from './schema/tables.js';
import { type DatabaseConfig } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

export class MetadataStore {
  private db: BetterSQLite3Database<typeof schema>;
  private sqlite: Database.Database;
  private logger = getLogger('metadata-store');

  constructor(config: DatabaseConfig) {
    this.sqlite = new Database(config.url);
    this.db = drizzle(this.sqlite, { schema });
    this.initializeTables();
  }

  private initializeTables(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL CHECK(provider IN ('github', 'gitlab', 'bitbucket')),
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        full_name TEXT NOT NULL,
        default_branch TEXT DEFAULT 'main',
        is_active INTEGER DEFAULT 1,
        settings TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        UNIQUE(provider, full_name)
      );

      CREATE TABLE IF NOT EXISTS pull_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER NOT NULL REFERENCES repositories(id),
        external_id TEXT NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('open', 'closed', 'merged')),
        source_branch TEXT NOT NULL,
        target_branch TEXT NOT NULL,
        url TEXT NOT NULL,
        review_status TEXT DEFAULT 'pending' CHECK(review_status IN ('pending', 'reviewed', 'approved', 'changes_requested')),
        last_reviewed_at INTEGER,
        created_at INTEGER,
        updated_at INTEGER,
        UNIQUE(repository_id, number)
      );

      CREATE TABLE IF NOT EXISTS agent_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER REFERENCES repositories(id),
        pull_request_id INTEGER REFERENCES pull_requests(id),
        event_type TEXT NOT NULL,
        skill_name TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        input TEXT,
        output TEXT,
        error TEXT,
        tokens_used INTEGER,
        duration_ms INTEGER,
        created_at INTEGER,
        completed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL CHECK(provider IN ('github', 'gitlab', 'bitbucket')),
        event_type TEXT NOT NULL,
        delivery_id TEXT,
        payload TEXT NOT NULL,
        processed INTEGER DEFAULT 0,
        processed_at INTEGER,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        skill_name TEXT,
        repository_id INTEGER REFERENCES repositories(id),
        config TEXT,
        is_active INTEGER DEFAULT 1,
        last_run_at INTEGER,
        next_run_at INTEGER,
        created_at INTEGER,
        UNIQUE(name)
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL CHECK(channel IN ('slack')),
        recipient TEXT NOT NULL,
        subject TEXT,
        message TEXT NOT NULL,
        metadata TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'failed')),
        sent_at INTEGER,
        error TEXT,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS conversation_contexts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repository_id INTEGER REFERENCES repositories(id),
        pull_request_id INTEGER REFERENCES pull_requests(id),
        context_key TEXT NOT NULL,
        messages TEXT NOT NULL,
        summary TEXT,
        token_count INTEGER,
        expires_at INTEGER,
        created_at INTEGER,
        updated_at INTEGER,
        UNIQUE(context_key)
      );

      CREATE INDEX IF NOT EXISTS idx_pull_requests_repo ON pull_requests(repository_id);
      CREATE INDEX IF NOT EXISTS idx_agent_events_repo ON agent_events(repository_id);
      CREATE INDEX IF NOT EXISTS idx_agent_events_pr ON agent_events(pull_request_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
    `);
    this.logger.info('Database tables initialized');
  }

  // Repository methods
  async createRepository(data: schema.NewRepository): Promise<schema.Repository> {
    const [repo] = await this.db.insert(schema.repositories).values(data).returning();
    return repo!;
  }

  async getRepository(id: number): Promise<schema.Repository | undefined> {
    return this.db.query.repositories.findFirst({
      where: eq(schema.repositories.id, id),
    });
  }

  async getRepositoryByFullName(provider: string, fullName: string): Promise<schema.Repository | undefined> {
    return this.db.query.repositories.findFirst({
      where: and(
        eq(schema.repositories.provider, provider as 'github' | 'gitlab' | 'bitbucket'),
        eq(schema.repositories.fullName, fullName)
      ),
    });
  }

  async listRepositories(activeOnly = true): Promise<schema.Repository[]> {
    if (activeOnly) {
      return this.db.query.repositories.findMany({
        where: eq(schema.repositories.isActive, true),
      });
    }
    return this.db.query.repositories.findMany();
  }

  async updateRepository(id: number, data: Partial<schema.NewRepository>): Promise<void> {
    await this.db.update(schema.repositories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.repositories.id, id));
  }

  // Pull Request methods
  async createPullRequest(data: schema.NewPullRequest): Promise<schema.PullRequest> {
    const [pr] = await this.db.insert(schema.pullRequests).values(data).returning();
    return pr!;
  }

  async getPullRequest(repositoryId: number, number: number): Promise<schema.PullRequest | undefined> {
    return this.db.query.pullRequests.findFirst({
      where: and(
        eq(schema.pullRequests.repositoryId, repositoryId),
        eq(schema.pullRequests.number, number)
      ),
    });
  }

  async upsertPullRequest(data: schema.NewPullRequest): Promise<schema.PullRequest> {
    const existing = await this.getPullRequest(data.repositoryId, data.number);
    if (existing) {
      await this.db.update(schema.pullRequests)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.pullRequests.id, existing.id));
      return { ...existing, ...data, updatedAt: new Date() };
    }
    return this.createPullRequest(data);
  }

  async listOpenPullRequests(repositoryId: number): Promise<schema.PullRequest[]> {
    return this.db.query.pullRequests.findMany({
      where: and(
        eq(schema.pullRequests.repositoryId, repositoryId),
        eq(schema.pullRequests.state, 'open')
      ),
      orderBy: desc(schema.pullRequests.updatedAt),
    });
  }

  // Agent Event methods
  async createAgentEvent(data: schema.NewAgentEvent): Promise<schema.AgentEvent> {
    const [event] = await this.db.insert(schema.agentEvents).values(data).returning();
    return event!;
  }

  async updateAgentEvent(id: number, data: Partial<schema.NewAgentEvent>): Promise<void> {
    await this.db.update(schema.agentEvents)
      .set(data)
      .where(eq(schema.agentEvents.id, id));
  }

  async listAgentEvents(repositoryId?: number, limit = 100): Promise<schema.AgentEvent[]> {
    if (repositoryId) {
      return this.db.query.agentEvents.findMany({
        where: eq(schema.agentEvents.repositoryId, repositoryId),
        orderBy: desc(schema.agentEvents.createdAt),
        limit,
      });
    }
    return this.db.query.agentEvents.findMany({
      orderBy: desc(schema.agentEvents.createdAt),
      limit,
    });
  }

  // Webhook Event methods
  async createWebhookEvent(data: schema.NewWebhookEvent): Promise<schema.WebhookEvent> {
    const [event] = await this.db.insert(schema.webhookEvents).values(data).returning();
    return event!;
  }

  async markWebhookEventProcessed(id: number): Promise<void> {
    await this.db.update(schema.webhookEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(schema.webhookEvents.id, id));
  }

  async listUnprocessedWebhookEvents(limit = 100): Promise<schema.WebhookEvent[]> {
    return this.db.query.webhookEvents.findMany({
      where: eq(schema.webhookEvents.processed, false),
      orderBy: schema.webhookEvents.createdAt,
      limit,
    });
  }

  // Scheduled Job methods
  async createScheduledJob(data: schema.NewScheduledJob): Promise<schema.ScheduledJob> {
    const [job] = await this.db.insert(schema.scheduledJobs).values(data).returning();
    return job!;
  }

  async getScheduledJob(name: string): Promise<schema.ScheduledJob | undefined> {
    return this.db.query.scheduledJobs.findFirst({
      where: eq(schema.scheduledJobs.name, name),
    });
  }

  async listActiveScheduledJobs(): Promise<schema.ScheduledJob[]> {
    return this.db.query.scheduledJobs.findMany({
      where: eq(schema.scheduledJobs.isActive, true),
    });
  }

  async updateScheduledJob(id: number, data: Partial<schema.NewScheduledJob>): Promise<void> {
    await this.db.update(schema.scheduledJobs)
      .set(data)
      .where(eq(schema.scheduledJobs.id, id));
  }

  // Notification methods
  async createNotification(data: schema.NewNotification): Promise<schema.Notification> {
    const [notification] = await this.db.insert(schema.notifications).values(data).returning();
    return notification!;
  }

  async updateNotificationStatus(id: number, status: 'sent' | 'failed', error?: string): Promise<void> {
    await this.db.update(schema.notifications)
      .set({
        status,
        sentAt: status === 'sent' ? new Date() : undefined,
        error,
      })
      .where(eq(schema.notifications.id, id));
  }

  // Conversation Context methods
  async getConversationContext(contextKey: string): Promise<schema.ConversationContext | undefined> {
    return this.db.query.conversationContexts.findFirst({
      where: eq(schema.conversationContexts.contextKey, contextKey),
    });
  }

  async upsertConversationContext(data: schema.NewConversationContext): Promise<schema.ConversationContext> {
    const existing = await this.getConversationContext(data.contextKey);
    if (existing) {
      await this.db.update(schema.conversationContexts)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.conversationContexts.id, existing.id));
      return { ...existing, ...data, updatedAt: new Date() };
    }
    const [context] = await this.db.insert(schema.conversationContexts).values(data).returning();
    return context!;
  }

  async deleteExpiredContexts(): Promise<number> {
    const result = await this.db.delete(schema.conversationContexts)
      .where(sql`${schema.conversationContexts.expiresAt} < ${Date.now()}`);
    return result.changes;
  }

  close(): void {
    this.sqlite.close();
    this.logger.info('Database connection closed');
  }
}
