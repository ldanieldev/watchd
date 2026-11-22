import { eq, getTableColumns } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/db/schema'
import { isRegistrationOpen } from '~~/server/utils/registration'
import { queueSearchReindex } from '~~/server/utils/search/searchEvents'

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8)
})

export default defineEventHandler(async (event) => {
  if (!await isRegistrationOpen()) {
    throw createError({ statusCode: 403, statusMessage: 'Registration is closed' })
  }

  const body = await readBody(event)
  const parsed = registerSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation Error',
      data: z.flattenError(parsed.error)
    })
  }

  const { password, ...userColumns } = getTableColumns(users)

  // Check if email already exists
  const existing = await withQuerySpan('select-user-by-email', () =>
    db
      .select({ id: users.id, password: users.password })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1)
      .then(r => r[0])
  )

  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Email already exists' })
  }

  // Create new user with credentials
  const hashedPassword = await hashPassword(parsed.data.password)

  const user = await withQuerySpan('insert-user', () =>
    db
      .insert(users)
      .values({
        name: parsed.data.name,
        email: parsed.data.email,
        password: hashedPassword,
        isActive: true
      })
      .returning(userColumns)
      .then(r => r[0]!)
  )
  await queueSearchReindex([user.id])

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    }
  })

  return { success: true }
})
