import { createPin } from '~~/server/utils/plex/client'
import { assertPlexSignInAvailable, rethrowAsRouteError, writePlexSignIn } from '~~/server/utils/plex/routeSupport'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  assertPlexSignInAvailable()
  const pin = await rethrowAsRouteError(createPin)
  await writePlexSignIn(event, { pinId: pin.id, code: pin.code })
  const { origin } = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  return { pinId: pin.id, authUrl: pin.authUrl(`${origin}/settings/integrations?pin=${pin.id}`) }
})
