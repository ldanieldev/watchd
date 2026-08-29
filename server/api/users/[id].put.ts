import { eq, getTableColumns } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/db/schema'

const updateProfileSchema = z.object({
  name: z.string().min(1),
  email: z.email()
})

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

  const body = await readBody(event)
  const parsed = updateProfileSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation Error',
      data: z.flattenError(parsed.error)
    })
  }

  // Check email uniqueness if changed
  if (parsed.data.email !== session.user.email) {
    const existing = await withQuerySpan('select-user-by-email', () =>
      db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, parsed.data.email))
        .limit(1)
        .then(r => r[0])
    )

    if (existing) {
      throw createError({ statusCode: 409, statusMessage: 'Email already in use' })
    }
  }

  const { password, ...userColumns } = getTableColumns(users)

  const user = await withQuerySpan('update-user', () =>
    db
      .update(users)
      .set({
        name: parsed.data.name,
        email: parsed.data.email
      })
      .where(eq(users.id, id))
      .returning(userColumns)
      .then(r => r[0]!)
  )

  // Update session with new data
  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    }
  })

  return user
})
