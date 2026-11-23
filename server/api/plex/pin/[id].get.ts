import { checkPin, getPlexUser, listHomeProfiles, listServers } from '~~/server/utils/plex/client'
import { loadPlexConnection } from '~~/server/utils/plex/connection'
import {
  readPlexSignIn, readSignInAccountToken, rethrowAsRouteError, storeSignInAccountToken
} from '~~/server/utils/plex/routeSupport'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const signIn = await readPlexSignIn(event)
  if (!signIn || String(signIn.pinId) !== getRouterParam(event, 'id')) {
    throw createError({ statusCode: 400, statusMessage: 'This sign-in was not started here; start again' })
  }

  let accountToken = await readSignInAccountToken(user.id, signIn.pinId)
  if (!accountToken) {
    accountToken = await rethrowAsRouteError(() => checkPin(signIn.pinId, signIn.code))
    if (!accountToken) return { state: 'waiting' as const }
    await storeSignInAccountToken(user.id, signIn.pinId, accountToken)
  }

  const token = accountToken
  const servers = (await rethrowAsRouteError(() => listServers(token))).map(({ machineId, name }) => ({ machineId, name }))
  const plexUser = await rethrowAsRouteError(() => getPlexUser(token))
  const homeProfiles = plexUser.homeAdmin ? await rethrowAsRouteError(() => listHomeProfiles(token)) : []
  if (homeProfiles.length < 2) return { state: 'signed-in' as const, servers, profiles: null, currentProfileId: null }

  const connection = await loadPlexConnection(user.id)
  const connectedProfileId = connection && !connection.isServerOwner ? connection.profileAccountId : undefined
  const currentProfileId = homeProfiles.find(profile => profile.id === connectedProfileId)?.id
    ?? homeProfiles.find(profile => profile.isAdmin)?.id
    ?? null
  return { state: 'signed-in' as const, servers, profiles: homeProfiles, currentProfileId }
})
