import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

let redisAvailable = false;

export const redis = new Redis(env.REDIS_URL, {
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  enableReadyCheck: false,
  retryStrategy: () => null, // no retries — fail fast, treat as unavailable
});

redis.on('connect', () => {
  redisAvailable = true;
  logger.info('Redis connected');
});
redis.on('ready', () => { redisAvailable = true; });
redis.on('error', () => { redisAvailable = false; });
redis.on('close', () => { redisAvailable = false; });

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    redisAvailable = true;
  } catch {
    redisAvailable = false;
    logger.warn('⚠️  Redis unavailable — caching disabled, OTP stored in DB only');
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
  } catch {
    // ignore
  }
}

// Cache helpers — silently no-op when Redis is down
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (!redisAvailable) return null;
    try {
      const value = await redis.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    if (!redisAvailable) return;
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // ignore
    }
  },

  async del(key: string): Promise<void> {
    if (!redisAvailable) return;
    try {
      await redis.del(key);
    } catch {
      // ignore
    }
  },

  async delPattern(pattern: string): Promise<void> {
    if (!redisAvailable) return;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length) await redis.del(...keys);
    } catch {
      // ignore
    }
  },
};
