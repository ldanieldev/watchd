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

export function relativeDay(isoDateTime: string, now: Date): string {
  const days = Math.round((parseIsoDate(toIsoDate(now)).getTime() - parseIsoDate(isoDateTime).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-days, 'day')
}

export function msUntilNextMidnight(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
}
