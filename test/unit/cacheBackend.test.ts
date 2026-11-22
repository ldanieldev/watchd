import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStorage, prefixStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import { withFallback } from '../../server/utils/cache/redisFallback'
import { cacheBackend, clearCachedFunction } from '../../server/utils/cache/cacheBackend'

const seedKeys = [
  'nitro:functions:tmdb-person:12.json',
  'nitro:functions:tmdb-person:99.json',
  'nitro:functions:tmdb-personx:1.json',
  'rate:token-ip:1.2.3.4',
  'plex:signin:7:abc'
]

async function seed(storage: ReturnType<typeof createStorage>) {
  for (const key of seedKeys) await storage.setItem(`cache:${key}`, 'x')
}

afterEach(() => vi.unstubAllGlobals())

describe('clearCachedFunction', () => {
  it('removes only tmdb-person entries', async () => {
    const storage = createStorage()
    storage.mount('cache', memoryDriver())
    await seed(storage)

    const removed = await clearCachedFunction(prefixStorage(storage, 'cache'), 'tmdb-person')

    expect(removed).toBe(2)
    expect((await storage.getKeys('cache')).sort()).toEqual([
      'cache:nitro:functions:tmdb-personx:1.json',
      'cache:plex:signin:7:abc',
      'cache:rate:token-ip:1.2.3.4'
    ])
  })

  it('clears through withFallback while redis is down', async () => {
    const primary = memoryDriver()
    const fallback = memoryDriver()
    const storage = createStorage()
    storage.mount('cache', withFallback(primary, fallback, () => false, vi.fn()))
    await seed(storage)
    await primary.setItem!('nitro:functions:tmdb-person:5.json', 'x', {})

    const removed = await clearCachedFunction(prefixStorage(storage, 'cache'), 'tmdb-person')

    expect(removed).toBe(2)
    expect(await primary.getKeys('', {})).toEqual(['nitro:functions:tmdb-person:5.json'])
    expect((await fallback.getKeys('', {})).sort()).toEqual([
      'nitro:functions:tmdb-personx:1.json',
      'plex:signin:7:abc',
      'rate:token-ip:1.2.3.4'
    ])
  })
})

describe('cacheBackend', () => {
  const stubDriver = (driver: unknown) => vi.stubGlobal('useStorage', () => ({ getMount: () => ({ driver }) }))

  it('reports redis when the driver is redis and ready', () => {
    stubDriver({ name: 'redis', getInstance: () => ({ status: 'ready' }) })
    expect(cacheBackend()).toBe('redis')
  })

  it('reports memory-fallback when redis is configured but reconnecting', () => {
    stubDriver({ name: 'redis', getInstance: () => ({ status: 'reconnecting' }) })
    expect(cacheBackend()).toBe('memory-fallback')
  })

  it('reports memory for a plain memory driver', () => {
    stubDriver(memoryDriver())
    expect(cacheBackend()).toBe('memory')
  })
})
