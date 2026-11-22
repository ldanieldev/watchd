import { cacheBackend } from '~~/server/utils/cache/cacheBackend'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  return { backend: cacheBackend() }
})
