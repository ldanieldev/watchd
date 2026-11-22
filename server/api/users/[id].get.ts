import { eq, getTableColumns } from 'drizzle-orm'
import { users } from '~~/server/db/schema'

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

  const { password, ...userColumns } = getTableColumns(users)

  const result = await withQuerySpan('select-user', () =>
    db.select(userColumns).from(users).where(eq(users.id, id)).limit(1)
  )

  const user = result?.[0]

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  return user
})
