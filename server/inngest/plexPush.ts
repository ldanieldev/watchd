import { NonRetriableError } from 'inngest'
import { inngest } from '../utils/inngest/client'
import { loadPlexConnection, plexServerFor } from '../utils/plex/connection'
import { abandonPlexPush, PLEX_PUSH_EVENT, runPlexPush } from '../utils/plex/outbound'
import type { PlexPushEventData } from '../utils/plex/outbound'

export const plexPush = inngest.createFunction(
  {
    id: 'plex-push',
    triggers: [{ event: PLEX_PUSH_EVENT }],
    concurrency: { key: 'event.data.userId', limit: 1 },
    retries: 5,
    onFailure: async ({ event, error }) => {
      const { userId, ops } = event.data.event.data as PlexPushEventData
      const connection = await loadPlexConnection(userId)
      if (connection) await abandonPlexPush({ connectionId: connection.id, userId, ops, error })
    }
  },
  async ({ event, step }) => {
    const { userId, ops } = event.data as PlexPushEventData
    return step.run('push-to-plex', async () => {
      const connection = await loadPlexConnection(userId)
      if (!connection) throw new NonRetriableError('user has no plex connection')
      return runPlexPush({ server: plexServerFor(connection), connectionId: connection.id, ops })
    })
  }
)
