import { describe, expect, it } from 'vitest'
import { relativeTimeAgo } from '~~/shared/utils/library/dates'

const now = new Date('2026-11-21T12:00:00Z')
const secondsBefore = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString()

describe('relativeTimeAgo', () => {
  it.each([
    [0, 'just now'],
    [59, 'just now'],
    [60, '1 minute ago'],
    [119, '1 minute ago'],
    [3_599, '59 minutes ago'],
    [3_600, '1 hour ago'],
    [86_399, '23 hours ago'],
    [86_400, 'yesterday'],
    [172_800, '2 days ago'],
    [2_591_999, '29 days ago'],
    [2_592_000, 'last month'],
    [31_535_999, '12 months ago'],
    [31_536_000, 'last year'],
    [63_072_000, '2 years ago']
  ])('describes %i seconds ago as "%s"', (seconds, expected) => {
    expect(relativeTimeAgo(secondsBefore(seconds), now)).toBe(expected)
  })

  it('treats a time in the future as just now', () => {
    expect(relativeTimeAgo(secondsBefore(-3_600), now)).toBe('just now')
  })
})
