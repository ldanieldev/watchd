import { z } from 'zod'
import type { H3Event } from 'h3'
import { watchedMinuteOf } from './watchedMinute'

const MAX_WATCHES_PER_REQUEST = 5000

const watchSchema = z.object({
  titleId: z.string().regex(/^\d+$/),
  episodeId: z.string().optional(),
  watchedAt: z.iso.datetime({ offset: true }),
  minutesWatched: z.number().int().positive().max(32767).optional()
}).refine(watch => !watch.episodeId || new RegExp(`^${watch.titleId}-\\d+-\\d+$`).test(watch.episodeId), {
  message: 'episodeId must belong to titleId',
  path: ['episodeId']
})

const bodySchema = z.object({ watches: z.array(watchSchema).min(1).max(MAX_WATCHES_PER_REQUEST) })

export interface WatchKey {
  titleId: number
  season: number | null
  number: number | null
  watchedAt: Date
  watchedMinute: Date
  minutesWatched: number | null
}

export async function readWatchKeys(event: H3Event): Promise<WatchKey[]> {
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Validation Error', data: z.flattenError(parsed.error) })

  return parsed.data.watches.map((watch) => {
    const [, season, number] = watch.episodeId?.split('-').map(Number) ?? []
    const watchedAt = new Date(watch.watchedAt)
    return {
      titleId: Number(watch.titleId),
      season: season ?? null,
      number: number ?? null,
      watchedAt,
      watchedMinute: watchedMinuteOf(watchedAt),
      minutesWatched: watch.minutesWatched ?? null
    }
  })
}
