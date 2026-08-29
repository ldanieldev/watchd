import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/db/schema'

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8)
})

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = session.user.id

  const body = await readBody(event)
  const parsed = changePasswordSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation Error',
      data: z.flattenError(parsed.error)
    })
  }

  const user = await withQuerySpan('select-user', () =>
    db
      .select({ id: users.id, password: users.password })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then(r => r[0]!)
  )

  // If user already has a password, verify the current one
  if (user.password) {
    if (!parsed.data.currentPassword) {
      throw createError({ statusCode: 400, statusMessage: 'Current password is required' })
    }
    const valid = await verifyPassword(user.password, parsed.data.currentPassword)
    if (!valid) {
      throw createError({ statusCode: 401, statusMessage: 'Current password is incorrect' })
    }
  }

  const hashedPassword = await hashPassword(parsed.data.newPassword)
  await withQuerySpan('update-user-password', () =>
    db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, userId))
  )

  return { success: true }
})
