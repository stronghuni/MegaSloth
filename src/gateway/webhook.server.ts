import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { type ServerConfig, type GitHubConfig, type GitLabConfig, type BitbucketConfig } from '../config/schema.js';
import { type MetadataStore } from '../storage/metadata.store.js';
import { getLogger } from '../utils/logger.js';

export interface WebhookEvent {
  provider: 'github' | 'gitlab' | 'bitbucket';
  eventType: string;
  deliveryId?: string;
  payload: unknown;
  repositoryFullName?: string;
}

export type WebhookEventHandler = (event: WebhookEvent) => Promise<void>;

export interface WebhookServerDeps {
  config: ServerConfig;
  githubConfig: GitHubConfig;
  gitlabConfig: GitLabConfig;
  bitbucketConfig: BitbucketConfig;
  metadataStore: MetadataStore;
  onEvent?: WebhookEventHandler;
}

export class WebhookServer {
  private server: FastifyInstance;
  private logger = getLogger('webhook-server');
  private deps: WebhookServerDeps;

  constructor(deps: WebhookServerDeps) {
    this.deps = deps;
    this.server = Fastify({
      logger: false,
    });

    this.server.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (req, body, done) => {
        (req as any).rawBody = body;
        try {
          done(null, JSON.parse(body.toString()));
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // GitHub webhook
    this.server.post('/webhook/github', {
      config: {
        rawBody: true,
      },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const signature = request.headers['x-hub-signature-256'] as string | undefined;
      const event = request.headers['x-github-event'] as string | undefined;
      const deliveryId = request.headers['x-github-delivery'] as string | undefined;

      if (!event) {
        return reply.status(400).send({ error: 'Missing event header' });
      }

      if (this.deps.githubConfig.webhookSecret) {
        if (!signature) {
          return reply.status(401).send({ error: 'Missing signature' });
        }

        const rawBody = (request as unknown as { rawBody: Buffer }).rawBody;
        if (!this.verifyGitHubSignature(rawBody, signature, this.deps.githubConfig.webhookSecret)) {
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      }

      const payload = request.body as Record<string, unknown>;
      const repositoryFullName = (payload.repository as Record<string, unknown> | undefined)?.full_name as string | undefined;

      await this.handleWebhookEvent({
        provider: 'github',
        eventType: event,
        deliveryId,
        payload,
        repositoryFullName,
      });

      return { received: true };
    });

    // GitLab webhook
    this.server.post('/webhook/gitlab', async (request: FastifyRequest, reply: FastifyReply) => {
      const token = request.headers['x-gitlab-token'] as string | undefined;
      const event = request.headers['x-gitlab-event'] as string | undefined;

      if (!event) {
        return reply.status(400).send({ error: 'Missing event header' });
      }

      if (this.deps.gitlabConfig.webhookSecret && token !== this.deps.gitlabConfig.webhookSecret) {
        return reply.status(401).send({ error: 'Invalid token' });
      }

      const payload = request.body as Record<string, unknown>;
      const project = payload.project as Record<string, unknown> | undefined;
      const repositoryFullName = project?.path_with_namespace as string | undefined;

      await this.handleWebhookEvent({
        provider: 'gitlab',
        eventType: this.normalizeGitLabEvent(event, payload),
        payload,
        repositoryFullName,
      });

      return { received: true };
    });

    // Bitbucket webhook
    this.server.post('/webhook/bitbucket', async (request: FastifyRequest, reply: FastifyReply) => {
      const event = request.headers['x-event-key'] as string | undefined;
      const hookUuid = request.headers['x-hook-uuid'] as string | undefined;

      if (!event) {
        return reply.status(400).send({ error: 'Missing event header' });
      }

      if (this.deps.bitbucketConfig.webhookSecret) {
        const signature = request.headers['x-hub-signature'] as string | undefined;
        if (signature) {
          const rawBody = ((request as any).rawBody as Buffer)?.toString() || JSON.stringify(request.body);
          if (!this.verifyBitbucketSignature(rawBody, signature, this.deps.bitbucketConfig.webhookSecret)) {
            return reply.status(401).send({ error: 'Invalid signature' });
          }
        }
      }

      const payload = request.body as Record<string, unknown>;
      const repository = payload.repository as Record<string, unknown> | undefined;
      const repositoryFullName = repository?.full_name as string | undefined;

      await this.handleWebhookEvent({
        provider: 'bitbucket',
        eventType: event,
        deliveryId: hookUuid,
        payload,
        repositoryFullName,
      });

      return { received: true };
    });

    // Health check
    this.server.get('/health', async () => {
      return { status: 'ok', service: 'webhook' };
    });
  }

  private verifyGitHubSignature(payload: Buffer, signature: string, secret: string): boolean {
    try {
      const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  private verifyBitbucketSignature(payload: string, signature: string, secret: string): boolean {
    try {
      const expected = createHmac('sha256', secret).update(payload).digest('hex');
      return timingSafeEqual(Buffer.from(signature.replace('sha256=', '')), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  private normalizeGitLabEvent(event: string, payload?: Record<string, unknown>): string {
    const eventMap: Record<string, string> = {
      'Push Hook': 'push',
      'Tag Push Hook': 'tag_push',
      'Merge Request Hook': 'merge_request',
      'Issue Hook': 'issue',
      'Note Hook': 'note',
      'Pipeline Hook': 'pipeline',
      'Job Hook': 'job',
      'Wiki Page Hook': 'wiki_page',
      'Deployment Hook': 'deployment',
      'Release Hook': 'release',
    };

    let baseEvent = eventMap[event] || event.toLowerCase().replace(/ hook$/i, '').replace(/ /g, '_');

    // Append action for merge_request events
    if (baseEvent === 'merge_request' && payload) {
      const objectAttributes = payload.object_attributes as Record<string, unknown> | undefined;
      const action = objectAttributes?.action as string | undefined;
      if (action) {
        baseEvent = `merge_request.${action}`;
      }
    }

    return baseEvent;
  }

  private async handleWebhookEvent(event: WebhookEvent): Promise<void> {
    this.logger.info({
      provider: event.provider,
      eventType: event.eventType,
      deliveryId: event.deliveryId,
      repositoryFullName: event.repositoryFullName,
    }, 'Received webhook event');

    // Store in database
    await this.deps.metadataStore.createWebhookEvent({
      provider: event.provider,
      eventType: event.eventType,
      deliveryId: event.deliveryId,
      payload: event.payload,
      processed: false,
    });

    // Call event handler if provided
    if (this.deps.onEvent) {
      try {
        await this.deps.onEvent(event);
      } catch (error) {
        this.logger.error({ error, event: event.eventType }, 'Error handling webhook event');
      }
    }
  }

  setEventHandler(handler: WebhookEventHandler): void {
    this.deps.onEvent = handler;
  }

  async start(): Promise<void> {
    const port = this.deps.config.webhookPort;
    const host = this.deps.config.host;
    await this.server.listen({ port, host });
    this.logger.info({ port, host }, 'Webhook server started');
  }

  async stop(): Promise<void> {
    await this.server.close();
    this.logger.info('Webhook server stopped');
  }

  getServer(): FastifyInstance {
    return this.server;
  }
}
