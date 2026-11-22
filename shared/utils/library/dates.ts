export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function startOfWeekMonday(date: Date): Date {
  const daysSinceMonday = (date.getDay() + 6) % 7
  return addDays(date, -daysSinceMonday)
}

export function monthName(date: Date): string {
  return date.toLocaleString('en', { month: 'long' })
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const RELATIVE_TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60]
]

export function relativeDay(isoDateTime: string, now: Date): string {
  const days = Math.round((parseIsoDate(toIsoDate(now)).getTime() - parseIsoDate(isoDateTime).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  return relativeTimeFormatter.format(-days, 'day')
}

export function relativeTimeAgo(isoDateTime: string, now: Date): string {
  const secondsAgo = Math.max(0, Math.round((now.getTime() - new Date(isoDateTime).getTime()) / 1000))
  const unitMatch = RELATIVE_TIME_UNITS.find(([, unitSeconds]) => secondsAgo >= unitSeconds)
  if (!unitMatch) return 'just now'
  const [unit, unitSeconds] = unitMatch
  return relativeTimeFormatter.format(-Math.floor(secondsAgo / unitSeconds), unit)
}

export function msUntilNextMidnight(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
}
