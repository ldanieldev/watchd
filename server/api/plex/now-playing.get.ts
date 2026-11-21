import { listenerRegistry } from '~~/server/utils/plex/listener'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return { items: await listenerRegistry.nowPlaying(user.id) }
})
