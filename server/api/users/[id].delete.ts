import { eq } from 'drizzle-orm'
import { users } from '~~/server/db/schema'
import { logger } from '~~/server/utils/logger'
import { deleteUserSearchDocuments } from '~~/server/utils/search/reindexUserSearch'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const id = Number(getRouterParam(event, 'id'))
  if (Number.isNaN(id) || id === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid user ID' })
  }

  if (session.user.id !== id) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  try {
    await deleteUserSearchDocuments(id)
  } catch (error) {
    logger.warn({ err: error, userId: id }, 'failed to delete the user\'s search documents')
  }
  await withQuerySpan('delete-user', () => db.delete(users).where(eq(users.id, id)))
  await clearUserSession(event)

  return { success: true }
})
