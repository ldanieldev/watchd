import { listAccessTokens } from '~~/server/utils/accessTokens/store'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return listAccessTokens(user.id)
})
