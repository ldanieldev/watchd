import { readWatchKeys } from '~~/server/utils/library/watchBody'
import { queuePlexPushAfterDelete } from '~~/server/utils/plex/outbound'
import { queueSearchReindex } from '~~/server/utils/search/searchEvents'
import { removeWatchRows } from '~~/server/utils/library/removeWatchRows'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const keys = await readWatchKeys(event)

  const { removed, deletedKeys, plexHistory } = await removeWatchRows(user.id, keys)
  if (removed > 0) await queuePlexPushAfterDelete(user.id, deletedKeys, plexHistory)
  await queueSearchReindex([user.id])
  return { removed }
})
