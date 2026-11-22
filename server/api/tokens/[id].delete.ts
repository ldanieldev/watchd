import { revokeAccessToken } from '~~/server/utils/accessTokens/store'
import { POSTGRES_INTEGER_MAX } from '~~/shared/utils/postgresLimits'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const rawTokenId = getRouterParam(event, 'id') ?? ''
  const tokenId = /^\d+$/.test(rawTokenId) ? Number(rawTokenId) : Number.NaN
  if (!(tokenId <= POSTGRES_INTEGER_MAX) || !(await revokeAccessToken(user.id, tokenId))) {
    throw createError({ statusCode: 404, statusMessage: 'Token not found' })
  }
  return { ok: true }
})
