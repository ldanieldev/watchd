import type { Storage } from 'unstorage'
import type { CacheBackend } from '~~/shared/types/maintenance'
import type { RedisLike } from '~~/server/utils/rateLimit/store'

export function cacheRedisClient(): (RedisLike & { status?: string }) | undefined {
  const driver = useStorage().getMount('cache').driver as {
    name?: string
    getInstance?: () => RedisLike & { status?: string }
  }
  return driver.name === 'redis' ? driver.getInstance?.() : undefined
}

export function cacheBackend(): CacheBackend {
  const redis = cacheRedisClient()
  if (!redis) return 'memory'
  return redis.status === 'ready' ? 'redis' : 'memory-fallback'
}

// Storage.clear(base) removes nothing for these keys, so delete the listed keys one by one.
export async function clearCachedFunction(storage: Storage, name: string): Promise<number> {
  const keys = await storage.getKeys(`nitro:functions:${name}`)
  await Promise.all(keys.map(key => storage.removeItem(key)))
  return keys.length
}
