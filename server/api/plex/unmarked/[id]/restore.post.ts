import { and, eq } from 'drizzle-orm'
import { plexUnmarked } from '~~/server/db/schema'
import { loadPlexConnection } from '~~/server/utils/plex/connection'
import { queuePlexPush } from '~~/server/utils/plex/outbound'
import { drizzlePlexScanStore } from '~~/server/utils/plex/scan'
import { queueSearchReindex } from '~~/server/utils/search/searchEvents'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid unmarked item ID' })

  const connection = await loadPlexConnection(user.id)
  const [unmarked] = connection
    ? await withQuerySpan('select-plex-unmarked-item', () => db
        .select({ ratingKey: plexUnmarked.ratingKey, titleId: plexUnmarked.titleId, season: plexUnmarked.season, number: plexUnmarked.number })
        .from(plexUnmarked)
        .where(and(eq(plexUnmarked.id, id), eq(plexUnmarked.connectionId, connection.id))))
    : []
  if (!connection || !unmarked) throw createError({ statusCode: 404, statusMessage: 'Unmarked item not found' })

  const restored = await drizzlePlexScanStore.restorePlays(user.id, connection.id, unmarked)
  await queuePlexPush(user.id, [{ op: 'mark', titleId: unmarked.titleId, season: unmarked.season, number: unmarked.number }])
  await queueSearchReindex([user.id])
  return { restored }
})
