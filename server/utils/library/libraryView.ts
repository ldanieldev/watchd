import type { H3Event } from 'h3'
import type { LibraryData } from '~~/shared/utils/library/types'
import { parseIsoDate } from '~~/shared/utils/library/dates'
import { inViewerZone } from '~~/shared/utils/library/views'
import { loadUserLibrary } from '~~/server/utils/library/loadUserLibrary'
import { isTimeZone, todayIn } from '~~/shared/utils/zonedTime'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function viewerClock(event: H3Event): { timeZone: string, todayIso: string } {
  const query = getQuery(event)
  const timeZone = [typeof query.tz === 'string' ? query.tz : undefined, getCookie(event, 'tz')].find(isTimeZone) ?? 'UTC'
  const todayIso = typeof query.today === 'string' && ISO_DATE.test(query.today) ? query.today : todayIn(timeZone)
  return { timeZone, todayIso }
}

/** The session user's library in the viewer's zone, and the viewer's today, for building a view. */
export async function readLibraryView(event: H3Event): Promise<{ library: LibraryData, today: Date, todayIso: string }> {
  const { user } = await requireUserSession(event)
  const { timeZone, todayIso } = viewerClock(event)
  const library = await loadUserLibrary(user.id)
  return { library: inViewerZone(library, timeZone), today: parseIsoDate(todayIso), todayIso }
}

export function queryParam<T extends string>(event: H3Event, name: string, allowed: readonly T[], fallback?: T): T {
  const value = getQuery(event)[name]
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  throw createError({ statusCode: 400, statusMessage: `Invalid ${name}` })
}
