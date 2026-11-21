import { describe, expect, it } from 'vitest'
import { isTimeZone, todayIn, toZonedTimestamp, zonedTimeToUtc } from '~~/shared/utils/zonedTime'

const CHICAGO = 'America/Chicago'

describe('toZonedTimestamp', () => {
  it('gives the wall-clock time in the zone, on the local day', () => {
    expect(toZonedTimestamp('2026-03-08T06:30:00Z', CHICAGO)).toBe('2026-03-08T00:30:00')
    expect(toZonedTimestamp('2026-03-08T06:30:00Z', 'Asia/Tokyo')).toBe('2026-03-08T15:30:00')
  })

  it('formats midnight as 00, not 24', () => {
    expect(toZonedTimestamp('2026-11-20T06:00:00Z', CHICAGO)).toBe('2026-11-20T00:00:00')
  })
})

describe('zonedTimeToUtc', () => {
  it('reads a wall-clock time in the zone before and after a DST change', () => {
    expect(zonedTimeToUtc('2026-03-08T00:30:00', CHICAGO).toISOString()).toBe('2026-03-08T06:30:00.000Z')
    expect(zonedTimeToUtc('2026-03-08T12:00:00', CHICAGO).toISOString()).toBe('2026-03-08T17:00:00.000Z')
  })

  it('round-trips with toZonedTimestamp', () => {
    const instant = '2026-07-19T18:06:00.000Z'
    expect(zonedTimeToUtc(toZonedTimestamp(instant, 'Australia/Adelaide'), 'Australia/Adelaide').toISOString()).toBe(instant)
  })
})

describe('todayIn', () => {
  it('names the calendar day in the zone', () => {
    const now = new Date('2026-11-21T03:00:00Z')
    expect(todayIn(CHICAGO, now)).toBe('2026-11-20')
    expect(todayIn('UTC', now)).toBe('2026-11-21')
  })
})

describe('isTimeZone', () => {
  it('accepts IANA zones and rejects anything else', () => {
    expect(isTimeZone(CHICAGO)).toBe(true)
    expect(isTimeZone('Not/AZone')).toBe(false)
    expect(isTimeZone('')).toBe(false)
  })
})
