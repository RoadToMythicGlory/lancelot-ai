import { PubSub } from 'graphql-subscriptions';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';

/**
 * PubSub instance for GraphQL subscriptions.
 *
 * Uses Redis when REDIS_URL is configured (required for multi-instance production).
 * Falls back to in-memory PubSub in development when Redis is not available.
 *
 * In-memory PubSub does NOT work across multiple server instances.
 */
function createPubSub(): PubSub | RedisPubSub {
  const redisUrl = process.env.REDIS_URL;
  const isProd = process.env.NODE_ENV === 'production';

  if (redisUrl) {
    try {
      const options = {
        host: new URL(redisUrl).hostname,
        port: parseInt(new URL(redisUrl).port || '6379', 10),
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
      };

      const redisPubSub = new RedisPubSub({
        publisher: new Redis(options),
        subscriber: new Redis(options),
      });

      console.log('✅ PubSub: Redis-backed (multi-instance safe)');
      return redisPubSub;
    } catch (error) {
      if (isProd) {
        console.error('❌ PubSub: Redis connection failed in production. Subscriptions will not work across instances.');
        throw error;
      }
      console.warn('⚠️  PubSub: Redis connection failed, using in-memory fallback (dev only)');
      return new PubSub();
    }
  }

  if (isProd) {
    console.warn('⚠️  PubSub: No REDIS_URL in production — subscriptions are single-instance only');
  }

  console.log('ℹ️  PubSub: In-memory (single instance, dev only)');
  return new PubSub();
}

export const pubsub = createPubSub();