export interface WatchedStateRow {
  ratingKey: string
  previousViewCount: number
  viewCount: number
  lastViewedAt?: number | null
  expectedViewCount: number | null
  outboundPending: boolean
  hasSoftDeleted: boolean
  hasNewHistory: boolean
}

export interface WatchedTransition {
  ratingKey: string
  action: 'restore' | 'create-play' | 'soft-delete'
  /** Unix seconds; set for create-play when Plex reports a lastViewedAt. */
  at?: number
}

const isWatched = (viewCount: number) => viewCount > 0
const isWatchdsOwnChange = (row: WatchedStateRow) => row.expectedViewCount !== null && isWatched(row.viewCount) === isWatched(row.expectedViewCount)

/** Actions for Plex watched-state changes between two polls; watchd's own and still-pending changes produce none. */
export function watchedTransitions(rows: WatchedStateRow[]): WatchedTransition[] {
  const transitions: WatchedTransition[] = []
  for (const row of rows) {
    if (row.outboundPending || isWatchdsOwnChange(row)) continue
    const wasWatched = isWatched(row.previousViewCount)
    const nowWatched = isWatched(row.viewCount)
    if (wasWatched && !nowWatched) transitions.push({ ratingKey: row.ratingKey, action: 'soft-delete' })
    if (wasWatched || !nowWatched || row.hasNewHistory) continue
    if (row.hasSoftDeleted) transitions.push({ ratingKey: row.ratingKey, action: 'restore' })
    else transitions.push({ ratingKey: row.ratingKey, action: 'create-play', ...(row.lastViewedAt != null && { at: row.lastViewedAt }) })
  }
  return transitions
}

/** Every settled expectation is spent after one poll: matched means the change was watchd's own, unmatched means the call never landed. */
export function expectationsToClear(rows: WatchedStateRow[]): { ratingKey: string, expectedViewCount: number }[] {
  return rows.flatMap(row => row.outboundPending || row.expectedViewCount === null ? [] : [{ ratingKey: row.ratingKey, expectedViewCount: row.expectedViewCount }])
}
