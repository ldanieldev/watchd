import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { titles, userTitles } from '~~/server/db/schema'

const settingsSchema = z.object({
  typeOverride: z.enum(['tv', 'anime']).nullable().optional(),
  heldStatus: z.enum(['paused', 'dropped']).nullable().optional()
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const titleId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(titleId) || titleId <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid title ID' })

  const parsed = settingsSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Validation Error', data: z.flattenError(parsed.error) })

  const [title] = await withQuerySpan('select-title-kind', () => db.select({ kind: titles.kind }).from(titles).where(eq(titles.id, titleId)))
  if (!title) throw createError({ statusCode: 404, statusMessage: 'Title not found' })
  if (title.kind === 'movie' && parsed.data.typeOverride) throw createError({ statusCode: 400, statusMessage: 'Films are always movies' })

  await withQuerySpan('upsert-user-title', () => db
    .insert(userTitles)
    .values({ userId: user.id, titleId, ...parsed.data })
    .onConflictDoUpdate({ target: [userTitles.userId, userTitles.titleId], set: parsed.data }))
  return { ok: true }
})
