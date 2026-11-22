import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { plexConnections } from '~~/server/db/schema'
import { listenerRegistry } from '~~/server/utils/plex/listener'
import { getPlexUser, listOwnedServers, PlexError, PlexServer, pickConnection } from '~~/server/utils/plex/client'
import { loadPlexConnection } from '~~/server/utils/plex/connection'
import { drizzlePlexLinkStore } from '~~/server/utils/plex/link'
import { restoreAllUnmarkedPlays } from '~~/server/utils/plex/scan'
import { queueSearchReindex } from '~~/server/utils/search/searchEvents'
import { PLEX_LINK_EVENT } from '~~/server/utils/inngest/plexLinkEvent'
import type { PlexLinkEventData } from '~~/server/utils/inngest/plexLinkEvent'
import {
  assertPlexSignInAvailable, defaultSectionIds, deleteSignInAccountToken, plexServerUnreachableError, queuePlexEvent, readPlexSignIn,
  readSignInAccountToken, rethrowAsRouteError, sectionsOf, writePlexSignIn
} from '~~/server/utils/plex/routeSupport'

const bodySchema = z.object({
  pinId: z.number().int(),
  machineId: z.string().min(1).max(64),
  serverUrlOverride: z.url({ protocol: /^https?$/ }).max(2000).optional()
})

const NOT_OWNER = `This Plex account isn't the server owner`

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  assertPlexSignInAvailable()
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Validation Error', data: z.flattenError(parsed.error) })
  const { machineId, serverUrlOverride, pinId } = parsed.data

  const signIn = await readPlexSignIn(event)
  if (!signIn || signIn.pinId !== pinId) throw createError({ statusCode: 400, statusMessage: 'Sign in with Plex first' })
  const accountToken = await readSignInAccountToken(user.id, pinId)
  if (!accountToken) throw createError({ statusCode: 400, statusMessage: 'Sign-in expired, sign in with Plex again' })

  const plexUser = await rethrowAsRouteError(() => getPlexUser(accountToken))
  if (!plexUser.homeAdmin) throw createError({ statusCode: 400, statusMessage: NOT_OWNER })

  const resource = (await rethrowAsRouteError(() => listOwnedServers(accountToken))).find(candidate => candidate.machineId === machineId)
  if (!resource) throw createError({ statusCode: 400, statusMessage: 'That server is not owned by this Plex account' })

  let serverUrl: string
  try {
    serverUrl = await pickConnection(resource, serverUrlOverride)
  } catch (error) {
    if (error instanceof PlexError) throw plexServerUnreachableError()
    throw error
  }

  const server = new PlexServer({ url: serverUrl, token: resource.accessToken })
  const accounts = await rethrowAsRouteError(() => server.accounts())
  const ownerAccount = accounts.find(account => account.name === plexUser.username)
  if (!ownerAccount) throw createError({ statusCode: 400, statusMessage: NOT_OWNER })
  const signedIn = {
    accountToken,
    serverToken: resource.accessToken,
    serverName: resource.name,
    serverUrl,
    serverUrlOverride: serverUrlOverride ?? null,
    ownerAccountId: ownerAccount.id,
    plexUsername: plexUser.username
  }

  const existing = await loadPlexConnection(user.id)
  if (existing?.serverMachineId === resource.machineId) {
    await withQuerySpan('update-plex-connection-sign-in', () => db
      .update(plexConnections)
      .set({ ...signedIn, tokenInvalid: false, updatedAt: new Date() })
      .where(eq(plexConnections.id, existing.id)))
  } else {
    const sectionIds = defaultSectionIds(await sectionsOf(server))
    // The listener's first pull reads from this cursor; starting it where the imports end keeps older Plex history (and deleted plays) out.
    const historyCursor = await drizzlePlexLinkStore.latestImportedPlayAt(user.id)
    await withQuerySpan('replace-plex-connection', () => db.transaction(async (tx) => {
      if (existing) {
        await restoreAllUnmarkedPlays(tx, user.id, existing.id)
        await tx.delete(plexConnections).where(eq(plexConnections.id, existing.id))
      }
      await tx.insert(plexConnections).values({ userId: user.id, ...signedIn, serverMachineId: resource.machineId, sectionIds, historyCursor })
    }))
    await queueSearchReindex([user.id])
  }
  await writePlexSignIn(event, null)
  await deleteSignInAccountToken(user.id, pinId)

  await listenerRegistry.startFor(user.id)
  await queuePlexEvent(PLEX_LINK_EVENT, { userId: user.id, rerun: false } satisfies PlexLinkEventData, 'the first sync')
  return { connected: true, serverName: resource.name }
})
