import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePlexState, startFakePlex } from '../fixtures/plex/fakePlex'
import type { FakePlex, FakePlexState } from '../fixtures/plex/fakePlex'
import type { ItemMapStore, PlexItemMapping } from '~~/server/utils/plex/itemMap'
import type { TmdbEpisodeRef } from '~~/server/utils/plex/match'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.mock('~~/server/utils/inngest/client', () => ({ inngest: { send: vi.fn() } }))
vi.stubGlobal('useRuntimeConfig', () => ({ plex: { syncMode: 'read-only', clientIdentifier: 'test-client-id' } }))

const { resolveEpisode, tmdbIdFromGuids } = await import('~~/server/utils/plex/match')
const { rebuildItemMap } = await import('~~/server/utils/plex/itemMap')
const { PlexServer } = await import('~~/server/utils/plex/client')

describe('tmdbIdFromGuids', () => {
  it('reads the tmdb:// guid', () => {
    expect(tmdbIdFromGuids(['imdb://tt1', 'tmdb://603', 'tvdb://2'])).toBe(603)
  })

  it('returns undefined without a tmdb:// guid', () => {
    expect(tmdbIdFromGuids(['imdb://tt1', 'tvdb://2'])).toBeUndefined()
  })

  it('ignores an id too large for a Postgres integer, so one malformed guid cannot fail the title insert', () => {
    expect(tmdbIdFromGuids(['tmdb://99999999999'])).toBeUndefined()
  })
})

describe('resolveEpisode', () => {
  it('maps a season-numbered Plex episode onto TMDB\'s absolute numbering by episode GUID', () => {
    const plexEpisode = { guids: ['tvdb://9', 'tmdb://5001'], parentIndex: 23, index: 2 }

    expect(resolveEpisode(plexEpisode, [{ season: 1, number: 1090, tmdbEpisodeId: 5001 }])).toEqual({ season: 1, number: 1090 })
  })

  it('falls back to Plex season and number when the episode has no tmdb:// guid', () => {
    const plexEpisode = { guids: ['tvdb://9'], parentIndex: 2, index: 7 }

    expect(resolveEpisode(plexEpisode, [{ season: 2, number: 6, tmdbEpisodeId: 1 }, { season: 2, number: 7, tmdbEpisodeId: null }])).toEqual({ season: 2, number: 7 })
  })

  it('waits for enrichment instead of matching by position when the title has no TMDB episode ids yet', () => {
    const plexEpisode = { guids: ['tmdb://777'], parentIndex: 1, index: 1 }

    expect(resolveEpisode(plexEpisode, [{ season: 1, number: 1, tmdbEpisodeId: null }])).toEqual({ unmatched: 'episode-not-in-tmdb' })
  })

  it('falls back to Plex season and number when the title has TMDB episode ids but none matches the guid', () => {
    const plexEpisode = { guids: ['tmdb://777'], parentIndex: 1, index: 1 }

    expect(resolveEpisode(plexEpisode, [{ season: 1, number: 1, tmdbEpisodeId: 5 }, { season: 1, number: 2, tmdbEpisodeId: null }])).toEqual({ season: 1, number: 1 })
  })

  it('reports episode-not-in-tmdb when neither the guid nor the position matches', () => {
    const plexEpisode = { guids: ['tmdb://777'], parentIndex: 23, index: 2 }

    expect(resolveEpisode(plexEpisode, [{ season: 1, number: 1090, tmdbEpisodeId: 5001 }])).toEqual({ unmatched: 'episode-not-in-tmdb' })
  })
})

function memoryItemMapStore({ episodesByTitleId = new Map(), existingTitleIds = new Map(), rejectRatingKeys = [] }: {
  episodesByTitleId?: Map<number, TmdbEpisodeRef[]>
  existingTitleIds?: Map<string, number>
  rejectRatingKeys?: string[]
} = {}) {
  const rows = new Map<string, PlexItemMapping>()
  const titleIds = new Map(existingTitleIds)
  const upsertCalls: string[][] = []
  let nextTitleId = 100
  const store: ItemMapStore = {
    async ensureTitles(stubs) {
      let created = 0
      for (const stub of stubs) {
        const key = `${stub.kind}-${stub.tmdbId}`
        if (titleIds.has(key)) continue
        titleIds.set(key, nextTitleId++)
        created++
      }
      return { titleIdsByKey: new Map(titleIds), createdCount: created }
    },
    async episodesOfTitles(ids) {
      return new Map(ids.flatMap(id => episodesByTitleId.has(id) ? [[id, episodesByTitleId.get(id)!]] : []))
    },
    async existingItems() {
      return [...rows.values()]
    },
    async upsertItems(_connectionId, items) {
      upsertCalls.push(items.map(item => item.ratingKey))
      if (items.some(item => rejectRatingKeys.includes(item.ratingKey))) throw new Error('value too long for type character varying(32)')
      for (const item of items) {
        const existing = rows.get(item.ratingKey)
        rows.set(item.ratingKey, existing ? { ...item, viewCount: existing.viewCount, lastViewedAt: existing.lastViewedAt } : item)
      }
    },
    async deleteItems(_connectionId, ratingKeys) {
      for (const ratingKey of ratingKeys) rows.delete(ratingKey)
    }
  }
  return { store, rows, titleIds, upsertCalls }
}

describe('rebuildItemMap', () => {
  const TOKEN = 'item-map-token'
  let state: FakePlexState
  let fake: FakePlex
  let server: InstanceType<typeof PlexServer>
  const connection = { id: 3, sectionIds: ['1', '2'] }

  beforeEach(async () => {
    vi.clearAllMocks()
    state = createFakePlexState({ token: TOKEN })
    fake = await startFakePlex(state)
    server = new PlexServer({ url: fake.url, token: TOKEN })
  })

  afterEach(async () => {
    await fake.stop()
  })

  it('maps movies and shows by tmdb guid, resolves episodes to TMDB numbering, and marks guid-less items unmatched', async () => {
    state.items = [
      { sectionId: 1, ratingKey: '10', type: 'movie', title: 'Synthetic Film', guids: ['imdb://tt1', 'tmdb://111'], viewCount: 2, lastViewedAt: 1_700_000_000 },
      { sectionId: 1, ratingKey: '11', type: 'movie', title: 'Home Video', guids: ['local://11'] },
      { sectionId: 2, ratingKey: '20', type: 'show', title: 'Synthetic Show', guids: ['tmdb://222'] },
      { sectionId: 2, ratingKey: '21', type: 'episode', title: 'Pilot', guids: ['tmdb://5001'], parentRatingKey: '20s', grandparentRatingKey: '20', parentIndex: 23, index: 2 },
      { sectionId: 2, ratingKey: '22', type: 'episode', title: 'Unaired', guids: [], parentRatingKey: '20s', grandparentRatingKey: '20', parentIndex: 99, index: 1 }
    ]
    const { store, rows } = memoryItemMapStore({ existingTitleIds: new Map([['tv-222', 7]]), episodesByTitleId: new Map([[7, [{ season: 1, number: 1090, tmdbEpisodeId: 5001 }]]]) })

    const result = await rebuildItemMap(connection, server, store)

    expect(result).toEqual({
      items: 5,
      unmatched: 2,
      newTitles: 1,
      watchedStates: [
        { ratingKey: '10', viewCount: 2, lastViewedAt: 1_700_000_000 },
        { ratingKey: '11', viewCount: 0, lastViewedAt: null },
        { ratingKey: '20', viewCount: 0, lastViewedAt: null },
        { ratingKey: '21', viewCount: 0, lastViewedAt: null },
        { ratingKey: '22', viewCount: 0, lastViewedAt: null }
      ]
    })
    expect(rows.get('10')).toMatchObject({ kind: 'movie', sectionId: '1', titleId: 100, season: null, number: null, unmatchedReason: null, viewCount: 2, lastViewedAt: 1_700_000_000 })
    expect(rows.get('11')).toMatchObject({ kind: 'movie', titleId: null, unmatchedReason: 'no-tmdb-guid' })
    expect(rows.get('20')).toMatchObject({ kind: 'show', titleId: 7, unmatchedReason: null })
    expect(rows.get('21')).toMatchObject({ kind: 'episode', parentRatingKey: '20', titleId: 7, season: 1, number: 1090, unmatchedReason: null })
    expect(rows.get('22')).toMatchObject({ kind: 'episode', titleId: 7, season: null, number: null, unmatchedReason: 'episode-not-in-tmdb' })
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 3, items: 5, unmatched: 2, newTitles: 1 }), 'plex item map rebuilt')
  })

  it('marks an episode of a guid-less show as no-tmdb-guid', async () => {
    state.items = [
      { sectionId: 2, ratingKey: '30', type: 'show', title: 'Unknown Show', guids: ['tvdb://5'] },
      { sectionId: 2, ratingKey: '31', type: 'episode', title: 'E1', guids: ['tmdb://9'], grandparentRatingKey: '30', parentIndex: 1, index: 1 }
    ]
    const { store, rows } = memoryItemMapStore()

    await rebuildItemMap(connection, server, store)

    expect(rows.get('31')).toMatchObject({ titleId: null, unmatchedReason: 'no-tmdb-guid' })
  })

  it('logs at debug when an episode\'s show is not in the listing', async () => {
    state.items = [{ sectionId: 2, ratingKey: '41', type: 'episode', title: 'Orphan', guids: [], grandparentRatingKey: '40', parentIndex: 1, index: 1 }]
    const { store, rows } = memoryItemMapStore()

    await rebuildItemMap(connection, server, store)

    expect(rows.get('41')).toMatchObject({ unmatchedReason: 'no-tmdb-guid' })
    expect(log.debug).toHaveBeenCalledWith({ connectionId: 3, ratingKey: '41', grandparentRatingKey: '40' }, 'plex episode show not in listing')
  })

  it('keeps the stored viewCount of an existing row, skips unchanged rows, and deletes rows no longer listed', async () => {
    state.items = [
      { sectionId: 1, ratingKey: '10', type: 'movie', title: 'Kept', guids: ['tmdb://111'], viewCount: 5 },
      { sectionId: 1, ratingKey: '12', type: 'movie', title: 'Rematched', guids: ['tmdb://112'] }
    ]
    const { store, rows, upsertCalls } = memoryItemMapStore({ existingTitleIds: new Map([['movie-111', 1], ['movie-112', 2]]) })
    const unchanged: PlexItemMapping = { ratingKey: '10', kind: 'movie', sectionId: '1', parentRatingKey: null, name: 'Kept', titleId: 1, season: null, number: null, unmatchedReason: null, viewCount: 1, lastViewedAt: 1_600_000_000 }
    rows.set('10', unchanged)
    rows.set('12', { ...unchanged, ratingKey: '12', titleId: null, unmatchedReason: 'no-tmdb-guid', viewCount: 0, lastViewedAt: null })
    rows.set('13', { ...unchanged, ratingKey: '13', titleId: 3 })

    await rebuildItemMap(connection, server, store)

    expect(rows.get('10')).toEqual(unchanged)
    expect(rows.get('12')).toMatchObject({ titleId: 2, unmatchedReason: null, viewCount: 0 })
    expect(rows.has('13')).toBe(false)
    expect(upsertCalls.flat()).toEqual(['12'])
  })

  it('isolates an item whose row fails to save, so the rest of the scan completes and its old row survives', async () => {
    state.items = [
      { sectionId: 1, ratingKey: '10', type: 'movie', title: 'Good', guids: ['tmdb://111'] },
      { sectionId: 1, ratingKey: 'bad', type: 'movie', title: 'Bad', guids: ['tmdb://112'] },
      { sectionId: 1, ratingKey: '14', type: 'movie', title: 'Also Good', guids: ['tmdb://114'] }
    ]
    const { store, rows } = memoryItemMapStore({ rejectRatingKeys: ['bad'] })
    rows.set('bad', { ratingKey: 'bad', kind: 'movie', sectionId: '1', parentRatingKey: null, titleId: null, season: null, number: null, unmatchedReason: 'no-tmdb-guid', viewCount: 0, lastViewedAt: null })

    const result = await rebuildItemMap(connection, server, store)

    expect(result.items).toBe(2)
    expect([...rows.keys()].toSorted()).toEqual(['10', '14', 'bad'])
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 3, ratingKey: 'bad' }), 'plex item map row failed')
  })

  it('only lists the item types each chosen section holds and ignores sections that are not chosen', async () => {
    state.sections.push({ id: 3, type: 'movie', title: 'Other', agent: 'tv.plex.agents.movie' })
    state.items = [{ sectionId: 3, ratingKey: '40', type: 'movie', title: 'Elsewhere', guids: ['tmdb://400'] }]
    const { store, rows } = memoryItemMapStore()

    await rebuildItemMap(connection, server, store)

    expect(rows.size).toBe(0)
    const listings = fake.rawUrls.filter(url => url.startsWith('/library/sections/') && url.includes('/all'))
    expect(listings.map(url => url.replace(/&.*$/, ''))).toEqual(['/library/sections/1/all?type=1', '/library/sections/2/all?type=2', '/library/sections/2/all?type=4'])
  })
})
