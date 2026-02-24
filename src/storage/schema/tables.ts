import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Repositories being monitored
export const repositories = sqliteTable('repositories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider', { enum: ['github', 'gitlab', 'bitbucket'] }).notNull(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  fullName: text('full_name').notNull(),
  defaultBranch: text('default_branch').default('main'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  settings: text('settings', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Pull requests
export const pullRequests = sqliteTable('pull_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repositoryId: integer('repository_id').references(() => repositories.id).notNull(),
  externalId: text('external_id').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  author: text('author').notNull(),
  state: text('state', { enum: ['open', 'closed', 'merged'] }).notNull(),
  sourceBranch: text('source_branch').notNull(),
  targetBranch: text('target_branch').notNull(),
  url: text('url').notNull(),
  reviewStatus: text('review_status', { enum: ['pending', 'reviewed', 'approved', 'changes_requested'] }).default('pending'),
  lastReviewedAt: integer('last_reviewed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Agent actions/events
export const agentEvents = sqliteTable('agent_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repositoryId: integer('repository_id').references(() => repositories.id),
  pullRequestId: integer('pull_request_id').references(() => pullRequests.id),
  eventType: text('event_type').notNull(),
  skillName: text('skill_name'),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] }).notNull(),
  input: text('input', { mode: 'json' }),
  output: text('output', { mode: 'json' }),
  error: text('error'),
  tokensUsed: integer('tokens_used'),
  durationMs: integer('duration_ms'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

// Webhook events received
export const webhookEvents = sqliteTable('webhook_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider', { enum: ['github', 'gitlab', 'bitbucket'] }).notNull(),
  eventType: text('event_type').notNull(),
  deliveryId: text('delivery_id'),
  payload: text('payload', { mode: 'json' }).notNull(),
  processed: integer('processed', { mode: 'boolean' }).default(false),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Scheduled jobs
export const scheduledJobs = sqliteTable('scheduled_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  cronExpression: text('cron_expression').notNull(),
  skillName: text('skill_name'),
  repositoryId: integer('repository_id').references(() => repositories.id),
  config: text('config', { mode: 'json' }),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
  nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Notifications sent
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channel: text('channel', { enum: ['slack'] }).notNull(),
  recipient: text('recipient').notNull(),
  subject: text('subject'),
  message: text('message').notNull(),
  metadata: text('metadata', { mode: 'json' }),
  status: text('status', { enum: ['pending', 'sent', 'failed'] }).notNull(),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Conversation context for LLM
export const conversationContexts = sqliteTable('conversation_contexts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repositoryId: integer('repository_id').references(() => repositories.id),
  pullRequestId: integer('pull_request_id').references(() => pullRequests.id),
  contextKey: text('context_key').notNull(),
  messages: text('messages', { mode: 'json' }).notNull(),
  summary: text('summary'),
  tokenCount: integer('token_count'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type PullRequest = typeof pullRequests.$inferSelect;
export type NewPullRequest = typeof pullRequests.$inferInsert;
export type AgentEvent = typeof agentEvents.$inferSelect;
export type NewAgentEvent = typeof agentEvents.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type NewScheduledJob = typeof scheduledJobs.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type ConversationContext = typeof conversationContexts.$inferSelect;
export type NewConversationContext = typeof conversationContexts.$inferInsert;
