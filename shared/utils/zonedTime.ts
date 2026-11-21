const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

export function isTimeZone(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    formatterFor(value)
    return true
  } catch {
    return false
  }
}

/** Wall-clock `YYYY-MM-DDTHH:mm:ss` of an instant in `timeZone`. */
export function toZonedTimestamp(instant: string | Date, timeZone: string): string {
  return formatterFor(timeZone).format(new Date(instant)).replace(' ', 'T')
}

function naiveAsUtcMs(naive: string): number {
  const [datePart = '', timePart = '00:00:00'] = naive.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour = 0, minute = 0, second = 0] = timePart.split(':').map(Number)
  return Date.UTC(year!, month! - 1, day!, hour, minute, second)
}

function zoneOffsetMs(instantMs: number, timeZone: string): number {
  return naiveAsUtcMs(toZonedTimestamp(new Date(instantMs), timeZone)) - instantMs
}

/** The instant at which the wall clock in `timeZone` reads `naive` (`YYYY-MM-DDTHH:mm[:ss]`). */
export function zonedTimeToUtc(naive: string, timeZone: string): Date {
  const wallClockMs = naiveAsUtcMs(naive)
  // Second pass corrects the offset when the first guess lands on the other side of a DST change.
  const firstGuess = wallClockMs - zoneOffsetMs(wallClockMs, timeZone)
  return new Date(wallClockMs - zoneOffsetMs(firstGuess, timeZone))
}

export function todayIn(timeZone: string, now = new Date()): string {
  return toZonedTimestamp(now, timeZone).slice(0, 10)
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
