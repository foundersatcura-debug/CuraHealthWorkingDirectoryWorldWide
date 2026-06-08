import { Redis } from '@upstash/redis';
import { env } from './env';
import { logger } from '../utils/logger';

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export async function connectRedis(): Promise<void> {
  try {
    await redis.ping();
    logger.info('Redis (Upstash) connected');
  } catch (err) {
    logger.warn('⚠️  Redis unavailable — caching disabled, OTP stored in DB only');
  }
}

export async function disconnectRedis(): Promise<void> {
  // Upstash REST client has no persistent connection to close
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get<T>(key);
      return value ?? null;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    try {
      await redis.set(key, value, { ex: ttlSeconds });
    } catch {
      // ignore
    }
  },

  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch {
      // ignore
    }
  },

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length) await redis.del(...keys);
    } catch {
      // ignore
    }
  },
};
