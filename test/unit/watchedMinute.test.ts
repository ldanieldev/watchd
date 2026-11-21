import { describe, expect, it } from 'vitest'
import { watchedMinuteOf } from '~~/server/utils/library/watchedMinute'

describe('watchedMinuteOf', () => {
  it('drops seconds and milliseconds', () => {
    expect(watchedMinuteOf(new Date('2026-07-19T18:06:42.500Z')).toISOString()).toBe('2026-07-19T18:06:00.000Z')
  })

  it('truncates in UTC whatever offset the input carried', () => {
    expect(watchedMinuteOf(new Date('2026-07-19T18:06:00-05:00')).toISOString()).toBe('2026-07-19T23:06:00.000Z')
  })
})
