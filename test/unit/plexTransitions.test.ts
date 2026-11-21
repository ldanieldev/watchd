import { describe, expect, it } from 'vitest'
import { expectationsToClear, watchedTransitions } from '~~/server/utils/plex/transitions'
import type { WatchedStateRow } from '~~/server/utils/plex/transitions'

const row = (overrides: Partial<WatchedStateRow>): WatchedStateRow => ({
  ratingKey: '900',
  previousViewCount: 0,
  viewCount: 0,
  lastViewedAt: 1_800_000_000,
  expectedViewCount: null,
  outboundPending: false,
  hasSoftDeleted: false,
  hasNewHistory: false,
  ...overrides
})

describe('watchedTransitions', () => {
  it('soft-deletes on a Plex unmark, then restores on the re-mark without creating a play (misclick round trip)', () => {
    expect(watchedTransitions([row({ previousViewCount: 1, viewCount: 0 })])).toEqual([{ ratingKey: '900', action: 'soft-delete' }])
    expect(watchedTransitions([row({ previousViewCount: 0, viewCount: 1, hasSoftDeleted: true })])).toEqual([{ ratingKey: '900', action: 'restore' }])
  })

  it('leaves soft-deleted plays alone when the item was watched again with new history (the import covers the new play)', () => {
    expect(watchedTransitions([row({ previousViewCount: 0, viewCount: 1, hasSoftDeleted: true, hasNewHistory: true })])).toEqual([])
  })

  it('creates a play at lastViewedAt for a Plex "Mark as Played" with no history entry', () => {
    expect(watchedTransitions([row({ previousViewCount: 0, viewCount: 1, lastViewedAt: 1_800_000_123 })]))
      .toEqual([{ ratingKey: '900', action: 'create-play', at: 1_800_000_123 }])
  })

  it('leaves a 0 → >0 change with new history to the history import', () => {
    expect(watchedTransitions([row({ previousViewCount: 0, viewCount: 1, hasNewHistory: true })])).toEqual([])
  })

  it('does nothing for an item with an outbound call pending, even on >0 → 0', () => {
    expect(watchedTransitions([row({ previousViewCount: 1, viewCount: 0, outboundPending: true })])).toEqual([])
  })

  it('does nothing for watchd\'s own unscrobble (expected 0, 1 → 0)', () => {
    expect(watchedTransitions([row({ previousViewCount: 1, viewCount: 0, expectedViewCount: 0 })])).toEqual([])
  })

  it('does nothing for watchd\'s own scrobble (expected 1, 0 → 1)', () => {
    expect(watchedTransitions([row({ previousViewCount: 0, viewCount: 1, expectedViewCount: 1 })])).toEqual([])
  })

  it('acts on a Plex unmark that contradicts watchd\'s expected mark', () => {
    expect(watchedTransitions([row({ previousViewCount: 1, viewCount: 0, expectedViewCount: 1 })])).toEqual([{ ratingKey: '900', action: 'soft-delete' }])
  })

  it('ignores rewatches and unchanged items', () => {
    expect(watchedTransitions([row({ previousViewCount: 1, viewCount: 2 }), row({ previousViewCount: 0, viewCount: 0 }), row({ previousViewCount: 3, viewCount: 3 })])).toEqual([])
  })
})

describe('expectationsToClear', () => {
  it('clears an expectation the fresh state matches, after the change is treated as watchd\'s own', () => {
    const matched = row({ previousViewCount: 0, viewCount: 1, expectedViewCount: 1 })

    expect(watchedTransitions([matched])).toEqual([])
    expect(expectationsToClear([matched])).toEqual([{ ratingKey: '900', expectedViewCount: 1 }])
  })

  it('clears a stale expectation the fresh state does not match when nothing changed (call never landed)', () => {
    const stale = row({ previousViewCount: 0, viewCount: 0, expectedViewCount: 1 })

    expect(watchedTransitions([stale])).toEqual([])
    expect(expectationsToClear([stale])).toEqual([{ ratingKey: '900', expectedViewCount: 1 }])
  })

  it('keeps the expectation of an item whose outbound call is still pending, and ignores items without one', () => {
    expect(expectationsToClear([row({ expectedViewCount: 1, outboundPending: true }), row({ ratingKey: '901' })])).toEqual([])
  })
})
