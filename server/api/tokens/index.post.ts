import { z } from 'zod'
import { DuplicateAccessTokenNameError, createAccessToken } from '~~/server/utils/accessTokens/store'

const MAX_NAME_LENGTH = 60

const createTokenSchema = z.object({
  name: z.string('Name the token').trim().min(1, 'Name the token').max(MAX_NAME_LENGTH, `Token names are ${MAX_NAME_LENGTH} characters or fewer.`)
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readBody(event)
  const parsed = createTokenSchema.safeParse(typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {})
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]!.message, data: z.flattenError(parsed.error) })
  }
  try {
    return await createAccessToken(user.id, parsed.data.name)
  } catch (error) {
    if (error instanceof DuplicateAccessTokenNameError) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    throw error
  }
})
