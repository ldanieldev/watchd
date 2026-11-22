export interface RateRule {
  name: string
  limit: number
  windowSeconds: number
}

export interface RateCount {
  count: number
  resetAt: number
}

export interface RateStore {
  hit: (key: string, windowMs: number) => Promise<RateCount>
}

export interface RedisLike {
  multi: () => {
    set: (key: string, value: number, px: 'PX', ms: number, nx: 'NX') => unknown
    incr: (key: string) => unknown
    pttl: (key: string) => unknown
    exec: () => Promise<Array<[Error | null, unknown]> | null>
  }
}

const SWEEP_EVERY_MS = 60_000

export function createMemoryStore(now: () => number = Date.now): RateStore {
  const entries = new Map<string, RateCount>()
  let nextSweep = now() + SWEEP_EVERY_MS
  // Unique client IPs would otherwise accumulate for the life of the process.
  const sweep = () => {
    if (now() < nextSweep) return
    nextSweep = now() + SWEEP_EVERY_MS
    for (const [key, entry] of entries) if (entry.resetAt <= now()) entries.delete(key)
  }
  return {
    hit: async (key, windowMs) => {
      sweep()
      const existing = entries.get(key)
      const entry = existing && existing.resetAt > now() ? existing : { count: 0, resetAt: now() + windowMs }
      entry.count += 1
      entries.set(key, entry)
      return { ...entry }
    }
  }
}

export function createRedisStore(redis: RedisLike, now: () => number = Date.now): RateStore {
  return {
    hit: async (key, windowMs) => {
      // NX starts the window on the first hit only; INCR then keeps that expiry.
      const pipeline = redis.multi()
      pipeline.set(key, 0, 'PX', windowMs, 'NX')
      pipeline.incr(key)
      pipeline.pttl(key)
      const replies = await pipeline.exec()
      if (!replies) throw new Error('rate limit transaction aborted')
      const [, count, ttl] = replies.map(([error, value]) => {
        if (error) throw error
        return value
      })
      return { count: Number(count), resetAt: now() + Math.max(Number(ttl), 0) }
    }
  }
}

export function ruleKey(rule: RateRule, id: string) {
  return `ratelimit:${rule.name}:${id}`
}

export function retryAfterSeconds(count: RateCount, now: number) {
  return Math.max(1, Math.ceil((count.resetAt - now) / 1000))
}
