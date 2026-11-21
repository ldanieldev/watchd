import { checkPin, listOwnedServers } from '~~/server/utils/plex/client'
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
  const servers = await rethrowAsRouteError(() => listOwnedServers(token))
  return { state: 'signed-in' as const, servers: servers.map(({ machineId, name }) => ({ machineId, name })) }
})
