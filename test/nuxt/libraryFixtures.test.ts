import { describe, expect, it } from 'vitest'
import { buildFixtures } from '~~/test/fixtures/buildFixtures'

function countBy<T>(items: T[], keyOf: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1)
  return counts
}

describe('library fixtures', () => {
  const { watches } = buildFixtures(new Date(2026, 10, 20))

  it('spreads watches across the day', () => {
    expect(new Set(watches.map(watch => watch.watchedAt.slice(11, 13))).size).toBeGreaterThanOrEqual(8)
  })

  it('has binge days', () => {
    const perTitleDay = countBy(watches, watch => `${watch.titleId}|${watch.watchedAt.slice(0, 10)}`)
    expect(Math.max(...perTitleDay.values())).toBeGreaterThanOrEqual(3)
  })

  it('never dates a watch today', () => {
    expect(watches.filter(watch => watch.watchedAt.startsWith('2026-11-20'))).toEqual([])
  })

  it('covers the last 12 months', () => {
    expect(watches.some(watch => watch.watchedAt < '2025-12-01')).toBe(true)
  })
})
