import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { type ServerConfig } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

// WebSocket interface for type compatibility
interface WebSocketConnection {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (data: Buffer | string) => void): void;
  on(event: 'close', listener: () => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
}

export interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: string;
}

export interface WebSocketServerDeps {
  config: ServerConfig;
}

export class WebSocketServer {
  private server: FastifyInstance;
  private logger = getLogger('websocket-server');
  private deps: WebSocketServerDeps;
  private clients: Set<WebSocketConnection> = new Set();

  constructor(deps: WebSocketServerDeps) {
    this.deps = deps;
    this.server = Fastify({
      logger: false,
    });
  }

  private async setup(): Promise<void> {
    await this.server.register(websocket);

    this.server.get('/ws', { websocket: true }, (socket, request) => {
      this.handleConnection(socket);
    });

    // Health check
    this.server.get('/health', async () => {
      return {
        status: 'ok',
        service: 'websocket',
        connectedClients: this.clients.size,
      };
    });
  }

  private handleConnection(socket: WebSocketConnection): void {
    this.clients.add(socket);
    this.logger.info({ clientCount: this.clients.size }, 'Client connected');

    // Send welcome message
    this.sendToClient(socket, {
      type: 'connected',
      payload: { message: 'Connected to MegaSloth WebSocket server' },
      timestamp: new Date().toISOString(),
    });

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        this.handleMessage(socket, message);
      } catch (error) {
        this.logger.warn({ error }, 'Failed to parse WebSocket message');
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      this.logger.info({ clientCount: this.clients.size }, 'Client disconnected');
    });

    socket.on('error', (error) => {
      this.logger.error({ error }, 'WebSocket error');
      this.clients.delete(socket);
    });
  }

  private handleMessage(socket: WebSocketConnection, message: WebSocketMessage): void {
    this.logger.debug({ type: message.type }, 'Received message');

    switch (message.type) {
      case 'ping':
        this.sendToClient(socket, {
          type: 'pong',
          payload: {},
          timestamp: new Date().toISOString(),
        });
        break;

      case 'subscribe':
        // Handle subscription to specific events
        this.logger.info({ payload: message.payload }, 'Client subscribed');
        break;

      case 'unsubscribe':
        this.logger.info({ payload: message.payload }, 'Client unsubscribed');
        break;

      default:
        this.logger.warn({ type: message.type }, 'Unknown message type');
    }
  }

  private sendToClient(socket: WebSocketConnection, message: WebSocketMessage): void {
    if (socket.readyState === 1) { // WebSocket.OPEN
      socket.send(JSON.stringify(message));
    }
  }

  broadcast(message: Omit<WebSocketMessage, 'timestamp'>): void {
    const fullMessage: WebSocketMessage = {
      ...message,
      timestamp: new Date().toISOString(),
    };

    const serialized = JSON.stringify(fullMessage);
    let sentCount = 0;

    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(serialized);
        sentCount++;
      }
    }

    this.logger.debug({ type: message.type, sentCount }, 'Broadcast message');
  }

  // Event methods for different notification types
  notifyAgentEvent(eventType: string, data: unknown): void {
    this.broadcast({
      type: 'agent_event',
      payload: { eventType, data },
    });
  }

  notifyWebhookReceived(provider: string, eventType: string): void {
    this.broadcast({
      type: 'webhook_received',
      payload: { provider, eventType },
    });
  }

  notifyPRReviewed(repository: string, prNumber: number, status: string): void {
    this.broadcast({
      type: 'pr_reviewed',
      payload: { repository, prNumber, status },
    });
  }

  notifyJobCompleted(jobName: string, status: 'success' | 'failure'): void {
    this.broadcast({
      type: 'job_completed',
      payload: { jobName, status },
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  async start(): Promise<void> {
    await this.setup();
    const port = this.deps.config.websocketPort;
    const host = this.deps.config.host;
    await this.server.listen({ port, host });
    this.logger.info({ port, host }, 'WebSocket server started');
  }

  async stop(): Promise<void> {
    // Close all client connections
    for (const client of this.clients) {
      client.close(1000, 'Server shutting down');
    }
    this.clients.clear();

    await this.server.close();
    this.logger.info('WebSocket server stopped');
  }

  getServer(): FastifyInstance {
    return this.server;
  }
}
