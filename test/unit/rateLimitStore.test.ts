import { describe, expect, it } from 'vitest'
import { createMemoryStore, createRedisStore, retryAfterSeconds, ruleKey, type RedisLike } from '~~/server/utils/rateLimit/store'

function fakeRedis(clock: { now: number }) {
  const data = new Map<string, { value: number, expiresAt: number }>()
  const alive = (key: string) => {
    const entry = data.get(key)
    if (entry && entry.expiresAt <= clock.now) data.delete(key)
    return data.get(key)
  }
  const redis: RedisLike = {
    multi: () => {
      const operations: Array<() => unknown> = []
      return {
        set: (key, value, _px, milliseconds) => {
          operations.push(() => (alive(key) ? null : data.set(key, { value, expiresAt: clock.now + milliseconds }) && 'OK'))
        },
        incr: (key) => {
          operations.push(() => {
            const entry = alive(key) ?? { value: 0, expiresAt: Number.POSITIVE_INFINITY }
            entry.value += 1
            data.set(key, entry)
            return entry.value
          })
        },
        pttl: (key) => {
          operations.push(() => (alive(key) ? alive(key)!.expiresAt - clock.now : -2))
        },
        exec: async () => operations.map(operation => [null, operation()] as [null, unknown])
      }
    }
  }
  return redis
}

const stores = {
  memory: (clock: { now: number }) => createMemoryStore(() => clock.now),
  redis: (clock: { now: number }) => createRedisStore(fakeRedis(clock), () => clock.now)
}

describe.each(Object.entries(stores))('%s rate store', (_name, make) => {
  it('counts hits inside one fixed window and reports when it resets', async () => {
    const clock = { now: 1_000 }
    const store = make(clock)

    expect(await store.hit('k', 60_000)).toEqual({ count: 1, resetAt: 61_000 })
    clock.now = 31_000
    expect(await store.hit('k', 60_000)).toEqual({ count: 2, resetAt: 61_000 })
  })

  it('starts a fresh window once the old one expires', async () => {
    const clock = { now: 0 }
    const store = make(clock)
    await store.hit('k', 1_000)
    await store.hit('k', 1_000)
    clock.now = 1_000

    expect(await store.hit('k', 1_000)).toEqual({ count: 1, resetAt: 2_000 })
  })

  it('keeps keys independent', async () => {
    const store = make({ now: 0 })
    await store.hit('a', 1_000)

    expect((await store.hit('b', 1_000)).count).toBe(1)
  })
})

describe('redis rate store', () => {
  it('surfaces a failed command so the caller can fail open', async () => {
    const broken: RedisLike = {
      multi: () => ({
        set: () => undefined,
        incr: () => undefined,
        pttl: () => undefined,
        exec: async () => [[new Error('down'), null]] as Array<[Error | null, unknown]>
      })
    }

    await expect(createRedisStore(broken).hit('k', 1_000)).rejects.toThrow('down')
  })

  it('surfaces an aborted transaction', async () => {
    const aborted: RedisLike = {
      multi: () => ({ set: () => undefined, incr: () => undefined, pttl: () => undefined, exec: async () => null })
    }

    await expect(createRedisStore(aborted).hit('k', 1_000)).rejects.toThrow('aborted')
  })
})

describe('helpers', () => {
  it('namespaces keys by rule', () => {
    expect(ruleKey({ name: 'token-ip', limit: 1, windowSeconds: 1 }, '1.2.3.4')).toBe('ratelimit:token-ip:1.2.3.4')
  })

  it('rounds Retry-After up to whole seconds, never below one', () => {
    expect(retryAfterSeconds({ count: 1, resetAt: 10_500 }, 10_000)).toBe(1)
    expect(retryAfterSeconds({ count: 1, resetAt: 12_001 }, 10_000)).toBe(3)
    expect(retryAfterSeconds({ count: 1, resetAt: 5_000 }, 10_000)).toBe(1)
  })
})
