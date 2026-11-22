import type { H3Event } from 'h3'
import { logger } from '~~/server/utils/logger'
import {
  createMemoryStore,
  createRedisStore,
  retryAfterSeconds,
  ruleKey,
  type RateCount,
  type RateRule,
  type RateStore,
  type RedisLike
} from './store'

export const RATE_RULES = {
  badToken: { name: 'token-ip', limit: 30, windowSeconds: 15 * 60 }
} satisfies Record<string, RateRule>

const memory = createMemoryStore()

function currentStore(): RateStore {
  const driver = useStorage().getMount('cache').driver as {
    name?: string
    getInstance?: () => RedisLike & { status?: string }
  }
  const redis = driver.name === 'redis' ? driver.getInstance?.() : undefined
  return redis?.status === 'ready' ? createRedisStore(redis) : memory
}

const STORE_ERROR_LOG_INTERVAL_MS = 60_000
const lastStoreErrorLog = new Map<string, number>()

// A store outage must not block a legitimate export script, so it fails open.
async function hitOrNull(rule: RateRule, id: string): Promise<RateCount | null> {
  try {
    return await currentStore().hit(ruleKey(rule, id), rule.windowSeconds * 1000)
  } catch (error) {
    const now = Date.now()
    if (now - (lastStoreErrorLog.get(rule.name) ?? -Infinity) >= STORE_ERROR_LOG_INTERVAL_MS) {
      lastStoreErrorLog.set(rule.name, now)
      logger.warn({ err: error, rule: rule.name }, 'rate-limit store unavailable; allowing the request')
    }
    return null
  }
}

// With trustProxy on, trusts exactly one hop: the last entry is the one our proxy set, any earlier ones are client-supplied.
export function clientIp(event: H3Event): string {
  const trustsProxy = String(useRuntimeConfig(event).trustProxy) === 'true'
  const lastHop = trustsProxy ? getRequestHeader(event, 'x-forwarded-for')?.split(',').pop()?.trim() : undefined
  return lastHop || getRequestIP(event) || 'unknown'
}

export async function consumeLimit(event: H3Event, rule: RateRule, id: string) {
  const count = await hitOrNull(rule, id)
  if (!count || count.count <= rule.limit) return
  const retryAfter = retryAfterSeconds(count, Date.now())
  logger.warn({ event: 'rate_limited', rule: rule.name, count: count.count, retryAfter }, 'rate limit exceeded')
  setResponseHeader(event, 'Retry-After', retryAfter)
  throw createError({ statusCode: 429, statusMessage: 'Too many attempts. Try again later.' })
}
