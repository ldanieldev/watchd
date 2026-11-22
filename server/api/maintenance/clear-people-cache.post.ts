import { prefixStorage } from 'unstorage'
import { cacheBackend, clearCachedFunction } from '~~/server/utils/cache/cacheBackend'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const removed = await clearCachedFunction(prefixStorage(useStorage(), 'cache'), 'tmdb-person')
  return { removed, backend: cacheBackend() }
})
