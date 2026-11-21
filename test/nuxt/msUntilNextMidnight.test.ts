import { describe, expect, it } from 'vitest'
import { msUntilNextMidnight } from '~~/shared/utils/library/dates'

describe('msUntilNextMidnight', () => {
  it('counts to the next local midnight', () => {
    expect(msUntilNextMidnight(new Date(2026, 10, 20, 23, 59, 0))).toBe(60_000)
    expect(msUntilNextMidnight(new Date(2026, 10, 20, 0, 0, 0))).toBe(24 * 60 * 60 * 1000)
  })
})
