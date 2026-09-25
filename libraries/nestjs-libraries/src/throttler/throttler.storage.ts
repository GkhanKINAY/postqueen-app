import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

/**
 * A throttler storage that can give a hit back (ThrottlerRefundInterceptor).
 * Both below keep one fixed window per key, so giving a hit back is taking
 * one off the window it was counted in, never below zero.
 */
export interface RefundableThrottlerStorage extends ThrottlerStorage {
  decrement(key: string, throttlerName: string): Promise<void>;
}

// Leaves the counter alone when it is gone (its window has ended, and the hit
// went with it) or at zero. DECR on a missing key would create it at -1 with
// no expiry, a counter that never resets. DECR keeps the expiry, so the window
// still ends when it would have.
const DECREMENT = `
  local hits = tonumber(redis.call('GET', KEYS[1]))
  if hits and hits > 0 then
    redis.call('DECR', KEYS[1])
  end
`;

export class RedisThrottlerStorage
  extends ThrottlerStorageRedisService
  implements RefundableThrottlerStorage
{
  async decrement(key: string, throttlerName: string) {
    // The counter's name as increment() in @nest-lab/throttler-storage-redis
    // builds it. throttler.storage.spec.ts fails if an upgrade changes it.
    await this.redis.call(
      'eval',
      DECREMENT,
      1,
      `{${key}:${throttlerName}}:hits`
    );
  }
}

/**
 * The storage without REDIS_URL, counting per process.
 *
 * It replaces @nestjs/throttler's own in-memory store, which gives every hit
 * a timer that takes it off again an hour later and keeps those timers per
 * throttler name rather than per key. A hit given back there would be taken
 * off a second time when its timer fired, and there is no finding the right
 * timer to cancel. This keeps the Redis script's fixed window instead, so
 * both storages count, block and give back the same way.
 */
export class MemoryThrottlerStorage implements RefundableThrottlerStorage {
  private readonly _windows = new Map<
    string,
    { hits: number; endsAt: number; blockedUntil: number }
  >();

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ) {
    const now = Date.now();
    const id = `${key}:${throttlerName}`;
    const current = this._windows.get(id);
    const window =
      current && current.endsAt > now
        ? current
        : {
            hits: 0,
            endsAt: now + ttl,
            blockedUntil: current?.blockedUntil || 0,
          };
    this._windows.set(id, window);

    window.hits += 1;
    if (window.blockedUntil <= now && window.hits > limit) {
      window.blockedUntil = now + blockDuration;
    }

    const isBlocked = window.blockedUntil > now;
    return {
      totalHits: window.hits,
      timeToExpire: Math.ceil((window.endsAt - now) / 1000),
      isBlocked,
      timeToBlockExpire: isBlocked
        ? Math.ceil((window.blockedUntil - now) / 1000)
        : 0,
    };
  }

  async decrement(key: string, throttlerName: string) {
    const window = this._windows.get(`${key}:${throttlerName}`);
    if (window && window.endsAt > Date.now() && window.hits > 0) {
      window.hits -= 1;
    }
  }
}
