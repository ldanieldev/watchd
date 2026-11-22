import type { H3Event } from 'h3'
import { logger } from '~~/server/utils/logger'
import { clientIp, consumeLimit, RATE_RULES } from '~~/server/utils/rateLimit/limit'
import { requestRoute } from '~~/server/utils/requestLog'
import { resolveAccessToken, touchAccessToken } from './store'
import { parseBearerToken } from './token'

export async function requireExportUserId(event: H3Event): Promise<number> {
  const authorizationHeader = getRequestHeader(event, 'authorization')
  if (authorizationHeader === undefined) {
    const { user } = await requireUserSession(event)
    return user.id
  }

  const token = parseBearerToken(authorizationHeader)
  const resolved = token ? await resolveAccessToken(token) : null
  if (!resolved) {
    await consumeLimit(event, RATE_RULES.badToken, clientIp(event))
    logger.warn({ route: requestRoute(event), malformed: token === null }, 'access token rejected')
    throw createError({ statusCode: 401, statusMessage: 'Invalid access token' })
  }
  try {
    await touchAccessToken(resolved.tokenId)
  } catch (error) {
    logger.warn({ route: requestRoute(event), err: error }, 'access token last-used update failed')
  }
  return resolved.userId
}
