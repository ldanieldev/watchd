import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { plexConnections } from '~~/server/db/schema'
import { listenerRegistry } from '~~/server/utils/plex/listener'
import { getPlexUser, listHomeProfiles, listServers, PlexError, PlexServer, pickConnection, switchHomeProfile } from '~~/server/utils/plex/client'
import { loadPlexConnection } from '~~/server/utils/plex/connection'
import { drizzlePlexLinkStore } from '~~/server/utils/plex/link'
import { restoreAllUnmarkedPlays } from '~~/server/utils/plex/scan'
import { queueSearchReindex } from '~~/server/utils/search/searchEvents'
import { isUniqueViolation } from '~~/server/utils/uniqueViolation'
import { PLEX_LINK_EVENT } from '~~/server/utils/inngest/plexLinkEvent'
import type { PlexLinkEventData } from '~~/server/utils/inngest/plexLinkEvent'
import {
  assertPlexSignInAvailable, defaultSectionIds, deleteSignInAccountToken, plexServerUnreachableError, queuePlexEvent, readPlexSignIn,
  readSignInAccountToken, rethrowAsRouteError, sectionsOf, writePlexSignIn
} from '~~/server/utils/plex/routeSupport'

const bodySchema = z.object({
  pinId: z.number().int(),
  machineId: z.string().min(1).max(64),
  serverUrlOverride: z.url({ protocol: /^https?$/ }).max(2000).optional(),
  profileId: z.number().int().optional(),
  profilePin: z.string().min(1).max(16).optional()
})

const signInExpiredError = () => createError({ statusCode: 400, statusMessage: 'Sign-in expired, sign in with Plex again' })

const PROFILE_UNIQUE_INDEX = 'plex_connections_server_profile_unique'

const profileConnectedElsewhereError = () => createError({ statusCode: 409, statusMessage: 'That Plex profile is already connected to another watchd account' })

const expiredSignInOr = (error: unknown) => (error instanceof PlexError && error.kind === 'unauthorized' ? signInExpiredError() : error)

async function switchToProfile(adminToken: string, profileId: number, profilePin: string | undefined): Promise<string> {
  const profiles = await rethrowAsRouteError(() => listHomeProfiles(adminToken).catch((error: unknown) => {
    throw expiredSignInOr(error)
  }))
  const profile = profiles.find(candidate => candidate.id === profileId)
  if (!profile) throw createError({ statusCode: 400, statusMessage: `That Plex profile isn't in this Home` })
  return rethrowAsRouteError(() => switchHomeProfile(adminToken, profile.id, profile.hasPin ? profilePin : undefined).catch((error: unknown) => {
    throw error instanceof PlexError && error.kind === 'http' && error.status !== undefined && error.status >= 400 && error.status < 500
      ? createError({ statusCode: 400, statusMessage: `That PIN isn't right for ${profile.title}` })
      : expiredSignInOr(error)
  }))
}

async function ownerServerAccountId(server: PlexServer, username: string): Promise<number> {
  const accounts = await rethrowAsRouteError(() => server.accounts())
  const ownerAccount = accounts.find(account => account.name === username)
  if (!ownerAccount) throw createError({ statusCode: 400, statusMessage: `This Plex account isn't the server owner` })
  return ownerAccount.id
}

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  assertPlexSignInAvailable()
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Validation Error', data: z.flattenError(parsed.error) })
  const { machineId, serverUrlOverride, pinId, profileId, profilePin } = parsed.data

  const signIn = await readPlexSignIn(event)
  if (!signIn || signIn.pinId !== pinId) throw createError({ statusCode: 400, statusMessage: 'Sign in with Plex first' })
  const accountToken = await readSignInAccountToken(user.id, pinId)
  if (!accountToken) throw signInExpiredError()

  const signedInUser = await rethrowAsRouteError(() => getPlexUser(accountToken).catch((error: unknown) => {
    throw expiredSignInOr(error)
  }))
  if (profileId !== undefined && !signedInUser.homeAdmin) throw createError({ statusCode: 400, statusMessage: 'Only the Plex Home admin can choose a profile' })
  const switching = profileId !== undefined && profileId !== signedInUser.id
  const profileToken = switching ? await switchToProfile(accountToken, profileId, profilePin) : accountToken
  const profileUser = switching
    ? await rethrowAsRouteError(() => getPlexUser(profileToken).catch((error: unknown) => {
        throw expiredSignInOr(error)
      }))
    : signedInUser
  const profileName = profileUser.title || profileUser.username

  const resource = (await rethrowAsRouteError(() => listServers(profileToken).catch((error: unknown) => {
    throw expiredSignInOr(error)
  }))).find(candidate => candidate.machineId === machineId)
  if (!resource) throw createError({ statusCode: 400, statusMessage: `${profileName} can't access that server` })

  let serverUrl: string
  try {
    serverUrl = await pickConnection(resource, serverUrlOverride)
  } catch (error) {
    if (error instanceof PlexError) throw plexServerUnreachableError()
    throw error
  }

  const server = new PlexServer({ url: serverUrl, token: resource.accessToken })
  // PMS gives the owner server account id 1, not its plex.tv id, and refuses /accounts to anyone else, whose server id is their plex.tv id.
  const profileAccountId = resource.owned ? await ownerServerAccountId(server, profileUser.username) : profileUser.id

  const [connectedElsewhere] = await withQuerySpan('select-plex-profile-connected-elsewhere', () => db
    .select({ id: plexConnections.id })
    .from(plexConnections)
    .where(and(
      eq(plexConnections.serverMachineId, resource.machineId),
      eq(plexConnections.profileAccountId, profileAccountId),
      ne(plexConnections.userId, user.id)
    ))
    .limit(1))
  if (connectedElsewhere) throw profileConnectedElsewhereError()

  const signedIn = {
    accountToken: profileToken,
    serverToken: resource.accessToken,
    serverName: resource.name,
    serverUrl,
    serverUrlOverride: serverUrlOverride ?? null,
    profileAccountId,
    profileName,
    isServerOwner: resource.owned
  }

  const existing = await loadPlexConnection(user.id)
  if (existing?.serverMachineId === resource.machineId && existing.profileAccountId === profileAccountId) {
    await withQuerySpan('update-plex-connection-sign-in', () => db
      .update(plexConnections)
      .set({ ...signedIn, tokenInvalid: false, updatedAt: new Date() })
      .where(eq(plexConnections.id, existing.id)))
  } else {
    const sectionIds = defaultSectionIds(await sectionsOf(server))
    // The listener's first pull reads from this cursor; starting it where the imports end keeps older Plex history (and deleted plays) out.
    const historyCursor = await drizzlePlexLinkStore.latestImportedPlayAt(user.id)
    try {
      await withQuerySpan('replace-plex-connection', () => db.transaction(async (tx) => {
        if (existing) {
          await restoreAllUnmarkedPlays(tx, user.id, existing.id)
          await tx.delete(plexConnections).where(eq(plexConnections.id, existing.id))
        }
        await tx.insert(plexConnections).values({ userId: user.id, ...signedIn, serverMachineId: resource.machineId, sectionIds, historyCursor })
      }))
    } catch (error) {
      throw isUniqueViolation(error, PROFILE_UNIQUE_INDEX) ? profileConnectedElsewhereError() : error
    }
    await queueSearchReindex([user.id])
  }
  await writePlexSignIn(event, null)
  await deleteSignInAccountToken(user.id, pinId)

  await listenerRegistry.startFor(user.id)
  await queuePlexEvent(PLEX_LINK_EVENT, { userId: user.id, rerun: false } satisfies PlexLinkEventData, 'the first sync')
  return { connected: true, serverName: resource.name }
})
