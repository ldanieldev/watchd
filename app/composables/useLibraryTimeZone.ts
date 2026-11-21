import { browserTimeZone, isTimeZone, todayIn } from '~~/shared/utils/zonedTime'

export const TIME_ZONE_COOKIE = 'tz'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function useTimeZoneCookie() {
  return useCookie<string | null>(TIME_ZONE_COOKIE, { maxAge: ONE_YEAR_SECONDS, sameSite: 'lax', path: '/' })
}

/** The viewer's IANA zone: the browser's own, or on the server the one it last reported in a cookie (UTC before that). */
export function useLibraryTimeZone() {
  const cookie = useTimeZoneCookie()
  return useState('library-time-zone', () => {
    if (import.meta.client) return browserTimeZone()
    return isTimeZone(cookie.value) ? cookie.value : 'UTC'
  })
}

export function useLibraryToday() {
  const timeZone = useLibraryTimeZone()
  return useState('library-today', () => todayIn(timeZone.value))
}
