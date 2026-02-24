import Redis from 'ioredis';
import { type RedisConfig } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

export class CacheStore {
  private redis: Redis.default;
  private logger = getLogger('cache-store');
  private prefix = 'megasloth:';
  private lastErrorLog = 0;

  constructor(config: RedisConfig) {
    this.redis = new Redis.default(config.url, {
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      retryStrategy: (times: number) => {
        if (times > 10) {
          return null;
        }
        return Math.min(times * 200, 10_000);
      },
    });

    this.redis.on('connect', () => {
      this.logger.info('Redis connected');
    });

    this.redis.on('error', (error: Error) => {
      const now = Date.now();
      if (now - this.lastErrorLog > 30_000) {
        this.lastErrorLog = now;
        this.logger.error({ error }, 'Redis connection failed — retrying in background');
      }
    });
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(this.key(key));
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await this.redis.setex(this.key(key), ttlSeconds, serialized);
    } else {
      await this.redis.set(this.key(key), serialized);
    }
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.redis.del(this.key(key));
    return result > 0;
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(this.key(key));
    return result > 0;
  }

  async increment(key: string): Promise<number> {
    return this.redis.incr(this.key(key));
  }

  async decrement(key: string): Promise<number> {
    return this.redis.decr(this.key(key));
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.expire(this.key(key), ttlSeconds);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.redis.ttl(this.key(key));
  }

  // List operations
  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.redis.lpush(this.key(key), ...values);
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    return this.redis.rpush(this.key(key), ...values);
  }

  async lpop(key: string): Promise<string | null> {
    return this.redis.lpop(this.key(key));
  }

  async rpop(key: string): Promise<string | null> {
    return this.redis.rpop(this.key(key));
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.redis.lrange(this.key(key), start, stop);
  }

  async llen(key: string): Promise<number> {
    return this.redis.llen(this.key(key));
  }

  // Hash operations
  async hset(key: string, field: string, value: string): Promise<number> {
    return this.redis.hset(this.key(key), field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.redis.hget(this.key(key), field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redis.hgetall(this.key(key));
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.redis.hdel(this.key(key), ...fields);
  }

  // Set operations
  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.redis.sadd(this.key(key), ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.redis.srem(this.key(key), ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return this.redis.smembers(this.key(key));
  }

  async sismember(key: string, member: string): Promise<boolean> {
    const result = await this.redis.sismember(this.key(key), member);
    return result === 1;
  }

  // Lock operations for distributed locking
  async acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(
      this.key(`lock:${lockKey}`),
      '1',
      'EX',
      ttlSeconds,
      'NX'
    );
    return result === 'OK';
  }

  async releaseLock(lockKey: string): Promise<boolean> {
    const result = await this.redis.del(this.key(`lock:${lockKey}`));
    return result > 0;
  }

  // Rate limiting
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
    const fullKey = this.key(`ratelimit:${key}`);
    const current = await this.redis.incr(fullKey);

    if (current === 1) {
      await this.redis.expire(fullKey, windowSeconds);
    }

    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
    };
  }

  getClient(): Redis.default {
    return this.redis;
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
    this.logger.info('Redis connection closed');
  }
}
