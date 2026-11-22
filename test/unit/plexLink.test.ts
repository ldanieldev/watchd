import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePlexState, startFakePlex } from '../fixtures/plex/fakePlex'
import type { FakePlex, FakePlexState } from '../fixtures/plex/fakePlex'
import type { ItemMapStore, PlexItemMapping } from '~~/server/utils/plex/itemMap'
import type { InboundStore, StoredInboundPlay, UnresolvedHistoryEntry } from '~~/server/utils/plex/inbound'
import type { PlexLinkStore } from '~~/server/utils/plex/link'
import type { PlexMediaOp } from '~~/server/utils/plex/outbound'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.mock('~~/server/utils/inngest/client', () => ({
  inngest: { send: vi.fn(), createFunction: (config: unknown, handler: unknown) => ({ config, handler }) }
}))
const queueSearchReindex = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/search/searchEvents', () => ({ queueSearchReindex }))
const loadPlexConnection = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/plex/connection', () => ({ loadPlexConnection, plexServerFor: () => ({}) }))
let syncMode = 'on'
vi.stubGlobal('useRuntimeConfig', () => ({ plex: { syncMode, clientIdentifier: 'test-client-id' } }))

const { runPlexLinkSteps } = await import('~~/server/utils/plex/link')
const { plexLink } = await import('~~/server/inngest/plexLink')
type LinkContext = import('~~/server/utils/plex/link').PlexLinkContext

const passThroughStep = { run: <Result>(_id: string, run: () => Promise<Result>) => run() }
const runPlexLink = ({ rerun, isFinalAttempt = true, ...context }: LinkContext & { rerun: boolean }) =>
  runPlexLinkSteps({ userId: context.connection.userId, rerun, isFinalAttempt, step: passThroughStep, loadContext: async () => context })
const { PlexServer, PlexError } = await import('~~/server/utils/plex/client')

const TOKEN = 'link-token'
const OWNER = 1
const USER_ID = 42
const FILM_A = 100
const FILM_B = 101
const SHOW = 7
const T = 1_700_000_000

interface MemoryPlay extends StoredInboundPlay { source: string, deletedAt: Date | null }
interface MemoryItem extends PlexItemMapping { outboundPending: boolean }

const play = (titleId: number, watchedAtSeconds: number, overrides: Partial<MemoryPlay> = {}): MemoryPlay => ({
  titleId, season: null, number: null, watchedAt: new Date(watchedAtSeconds * 1000), plexHistoryId: null, source: 'floppy', deletedAt: null, ...overrides
})

function memoryWorld(initialPlays: MemoryPlay[] = [], initialItems: MemoryItem[] = []) {
  const items = new Map(initialItems.map(item => [item.ratingKey, { ...item }]))
  const plays = initialPlays.map(row => ({ ...row }))
  const unresolved = new Map<number, UnresolvedHistoryEntry>()
  const progress: { historyCursor: number | null }[] = []
  const titleIdsByKey = new Map([['movie-111', FILM_A], ['movie-112', FILM_B], ['tv-222', SHOW]])
  const sent: PlexMediaOp[][] = []
  const enriched: number[][] = []
  const tokenFlags: number[] = []

  const itemMapStore: ItemMapStore = {
    async ensureTitles() { return { titleIdsByKey, createdCount: 0 } },
    async episodesOfTitles() { return new Map([[SHOW, [{ season: 1, number: 1, tmdbEpisodeId: null }]]]) },
    async existingItems() { return [...items.values()] },
    async upsertItems(_connectionId, mappings) {
      for (const mapping of mappings) {
        const existing = items.get(mapping.ratingKey)
        items.set(mapping.ratingKey, { ...mapping, outboundPending: existing?.outboundPending ?? false, viewCount: existing?.viewCount ?? mapping.viewCount, lastViewedAt: existing?.lastViewedAt ?? mapping.lastViewedAt })
      }
    },
    async deleteItems(_connectionId, ratingKeys) { for (const ratingKey of ratingKeys) items.delete(ratingKey) }
  }

  const inboundStore: InboundStore = {
    async mappedItems(_connectionId, ratingKeys) {
      return new Map(ratingKeys.flatMap(ratingKey => items.has(ratingKey) ? [[ratingKey, items.get(ratingKey)!]] : []))
    },
    async unresolvedEntries() { return [...unresolved.values()] },
    async storedHistoryIds(_userId, _machine, historyIds) {
      return new Set(plays.flatMap(row => row.plexHistoryId !== null && historyIds.includes(row.plexHistoryId) ? [row.plexHistoryId] : []))
    },
    async existingPlays(_userId, titleIds) { return plays.filter(row => titleIds.includes(row.titleId)) },
    async insertPlays(_userId, _machine, rows) {
      plays.push(...rows.map(row => ({ ...row, source: 'plex', deletedAt: null })))
      return rows.map(row => row.plexHistoryId)
    },
    async saveUnresolved(_connectionId, entries) { for (const entry of entries) unresolved.set(entry.historyId, entry) },
    async removeUnresolved(_connectionId, historyIds) { for (const historyId of historyIds) unresolved.delete(historyId) },
    async saveProgress(_connectionId, update) { progress.push({ historyCursor: update.historyCursor }) }
  }

  const matchesItem = (item: PlexItemMapping, row: MemoryPlay) => row.titleId === item.titleId && row.season === item.season && row.number === item.number
  const store: PlexLinkStore = {
    async latestImportedPlayAt() {
      const imported = plays.filter(row => row.source === 'floppy' || row.source === 'trakt')
      return imported.length ? Math.max(...imported.map(row => Math.floor(row.watchedAt.getTime() / 1000))) : null
    },
    async titleIdsNeedingEnrichment() { return [SHOW] },
    async markCandidates(_userId, _connectionId, unwatchedRatingKeys) {
      return [...items.values()]
        .filter(item => unwatchedRatingKeys.has(item.ratingKey) && !item.outboundPending && item.titleId !== null && item.unmatchedReason === null && item.kind !== 'show')
        .filter(item => plays.some(row => !row.deletedAt && matchesItem(item, row)))
        .map(item => ({ op: 'mark' as const, titleId: item.titleId!, season: item.season, number: item.number }))
    },
    async unmatchedCounts() {
      const all = [...items.values()]
      return { noTmdbGuid: all.filter(item => item.unmatchedReason === 'no-tmdb-guid').length, episodeNotInTmdb: all.filter(item => item.unmatchedReason === 'episode-not-in-tmdb').length }
    },
    async saveReport(_connectionId, report) { world.report = report },
    async flagTokenInvalid(connectionId) { tokenFlags.push(connectionId) }
  }

  const world = {
    items, plays, progress, sent, enriched, tokenFlags, report: undefined as unknown,
    stores: { store, itemMapStore, inboundStore },
    queueEnrichment: async (titleIds: number[]) => { enriched.push(titleIds) },
    sendPush: async (ops: PlexMediaOp[]) => {
      sent.push(ops)
      return true
    }
  }
  return world
}

describe('runPlexLink', () => {
  let state: FakePlexState
  let fake: FakePlex
  let server: InstanceType<typeof PlexServer>
  const connection = { id: 3, userId: USER_ID, ownerAccountId: OWNER, serverMachineId: 'server-a', sectionIds: ['1', '2'], historyCursor: null as number | null, lastPlayAt: null }

  const film = (ratingKey: string, tmdb: number, viewCount: number) => ({ sectionId: 1, ratingKey, type: 'movie' as const, title: `Film ${ratingKey}`, guids: [`tmdb://${tmdb}`], viewCount })
  const entry = (historyId: number, ratingKey: string, viewedAt: number) => ({ historyId, ratingKey, viewedAt, accountId: OWNER, sectionId: 1 })

  beforeEach(async () => {
    syncMode = 'on'
    vi.clearAllMocks()
    state = createFakePlexState({ token: TOKEN })
    fake = await startFakePlex(state)
    server = new PlexServer({ url: fake.url, token: TOKEN })
  })

  afterEach(async () => {
    await fake.stop()
  })

  it('pulls only history newer than the last Floppy/Trakt play', async () => {
    const world = memoryWorld([play(FILM_A, T)])
    state.items = [film('10', 111, 1), film('11', 112, 1)]
    state.history = [entry(1, '10', T - 100), entry(2, '11', T + 100)]

    const report = await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })

    expect(world.plays.filter(row => row.source === 'plex')).toEqual([expect.objectContaining({ titleId: FILM_B, plexHistoryId: 2 })])
    expect(report).toMatchObject({ pulled: { added: 1, duplicates: 0, unresolved: 0 } })
  })

  it('pulls all history for a user without imports', async () => {
    const world = memoryWorld()
    state.items = [film('10', 111, 1), film('11', 112, 1)]
    state.history = [entry(1, '10', 5), entry(2, '11', T)]

    const report = await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })

    expect(world.plays.map(row => row.plexHistoryId)).toEqual([1, 2])
    expect(report).toMatchObject({ pulled: { added: 2 } })
  })

  it('catches up from the cursor on a re-run, ignoring import dates', async () => {
    const world = memoryWorld([play(FILM_A, T + 1000)])
    state.items = [film('10', 111, 1), film('11', 112, 1)]
    state.history = [entry(1, '10', T - 100), entry(2, '11', T + 100)]

    await runPlexLink({ connection: { ...connection, historyCursor: T }, server, rerun: true, ...world.stores, ...world })

    expect(world.plays.filter(row => row.source === 'plex').map(row => row.plexHistoryId)).toEqual([2])
  })

  it('marks only items watchd has watched and Plex reports unwatched', async () => {
    const world = memoryWorld([play(FILM_A, T), play(FILM_B, T)])
    state.items = [film('10', 111, 0), film('11', 112, 1), film('12', 999, 0)]

    const report = await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })

    expect(world.sent).toEqual([[{ op: 'mark', titleId: FILM_A, season: null, number: null }]])
    expect(report).toMatchObject({ pushed: 1, unmatched: { noTmdbGuid: 0, episodeNotInTmdb: 0 }, errors: 0 })
  })

  it('judges "unwatched" by the fresh Plex listing, not a stale stored view count', async () => {
    const world = memoryWorld([play(FILM_A, T)], [{ ratingKey: '10', kind: 'movie', sectionId: '1', parentRatingKey: null, titleId: FILM_A, season: null, number: null, unmatchedReason: null, viewCount: 0, lastViewedAt: null, outboundPending: false }])
    state.items = [film('10', 111, 2)]

    await runPlexLink({ connection, server, rerun: true, ...world.stores, ...world })

    expect(world.sent).toEqual([])
  })

  it('skips items with a push already pending', async () => {
    const world = memoryWorld([play(FILM_A, T)], [{ ratingKey: '10', kind: 'movie', sectionId: '1', parentRatingKey: null, titleId: FILM_A, season: null, number: null, unmatchedReason: null, viewCount: 0, lastViewedAt: null, outboundPending: true }])
    state.items = [film('10', 111, 0)]

    await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })

    expect(world.sent).toEqual([])
  })

  it('sends marks in chunks and counts a chunk whose queueing failed in errors, then completes', async () => {
    const world = memoryWorld([play(FILM_A, T), play(FILM_B, T)])
    state.items = [film('10', 111, 0), film('11', 112, 0)]
    const sendPush = vi.fn()
      .mockRejectedValueOnce(new Error('inngest down'))
      .mockResolvedValueOnce(true)

    const report = await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world, sendPush, pushChunkSize: 1 })

    expect(sendPush).toHaveBeenCalledTimes(2)
    expect(report).toMatchObject({ pushed: 1, errors: 1 })
    expect(world.report).toEqual(report)
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, ops: 1 }), 'plex link push chunk failed')
  })

  it('re-queues enrichment for shows with episodes lacking a TMDB episode id', async () => {
    const world = memoryWorld()
    state.items = [film('10', 111, 1)]

    await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })

    expect(world.enriched).toEqual([[SHOW]])
  })

  it('stores the report with unmatched counts and logs one info summary', async () => {
    const world = memoryWorld()
    state.items = [film('10', 111, 1), { sectionId: 1, ratingKey: '13', type: 'movie', title: 'No guid', guids: [], viewCount: 0 }]

    const report = await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })

    expect(report).toMatchObject({ unmatched: { noTmdbGuid: 1, episodeNotInTmdb: 0 }, finishedAt: expect.any(String) })
    expect(world.report).toEqual(report)
    expect(log.info.mock.calls.filter(([, message]) => message === 'plex link finished')).toEqual([[expect.objectContaining({ userId: USER_ID, outcome: 'ok', pushed: 0, errors: 0 }), 'plex link finished']])
  })

  it('sends search/library.changed for the user after the history pull and pushes, before saving the report', async () => {
    const world = memoryWorld([play(FILM_A, T)])
    state.items = [film('10', 111, 1)]
    let reportWhenQueued: unknown = 'not queued'
    queueSearchReindex.mockImplementationOnce(async () => {
      reportWhenQueued = world.report
    })

    await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })

    expect(queueSearchReindex).toHaveBeenCalledWith([USER_ID])
    expect(reportWhenQueued).toBeUndefined()
    expect(world.report).toBeDefined()
  })

  it.each([
    ['the connection is gone', () => null],
    ['Plex rejects the token', (context: LinkContext) => {
      state.token = 'rotated'
      return context
    }]
  ])('still sends search/library.changed when the item map was rebuilt but the history pull ends because %s', async (_label, laterContext) => {
    const world = memoryWorld()
    state.items = [film('10', 111, 1)]
    const context: LinkContext = { connection, server, ...world.stores, ...world }
    const loadContext = vi.fn<(userId: number) => Promise<LinkContext | null>>()
      .mockResolvedValueOnce(context)
      .mockImplementation(async () => laterContext(context))
    const stepIds: string[] = []
    const step = { run: async <Result>(id: string, run: () => Promise<Result>) => {
      stepIds.push(id)
      return run()
    } }

    const outcome = await runPlexLinkSteps({ userId: USER_ID, rerun: false, isFinalAttempt: true, step, loadContext })

    expect(outcome).not.toHaveProperty('finishedAt')
    expect(stepIds).toEqual(['rebuild-item-map', 'pull-history', 'queue-search-reindex'])
    expect(queueSearchReindex).toHaveBeenCalledWith([USER_ID])
  })

  it('does not send search/library.changed when Plex rejects the token', async () => {
    const world = memoryWorld()
    state.token = 'rotated'

    await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })

    expect(queueSearchReindex).not.toHaveBeenCalled()
  })

  it('does nothing when sync is off', async () => {
    syncMode = 'off'
    const world = memoryWorld([play(FILM_A, T)])
    state.items = [film('10', 111, 0)]

    expect(await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })).toEqual({ skipped: 'sync off' })
    expect(fake.calls).toEqual([])
  })

  it('in read-only mode pulls and reports but queues no marks', async () => {
    syncMode = 'read-only'
    const world = memoryWorld([play(FILM_A, T)])
    state.items = [film('10', 111, 0), film('11', 112, 1)]
    state.history = [entry(2, '11', T + 100)]

    const report = await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })

    expect(world.sent).toEqual([])
    expect(report).toMatchObject({ pushed: 0, pulled: { added: 1 } })
  })

  it('flags the token and ends without a report when Plex rejects it', async () => {
    const world = memoryWorld()
    state.token = 'rotated'

    expect(await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })).toEqual({ tokenInvalid: true })
    expect(world.tokenFlags).toEqual([3])
    expect(world.report).toBeUndefined()
  })

  it('rethrows an unreachable Plex so the run retries', async () => {
    const world = memoryWorld()
    await fake.stop()
    await expect(runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })).rejects.toBeInstanceOf(PlexError)
    fake = await startFakePlex(state)
  })

  it('does not resurrect a play deleted in watchd after disconnect and reconnect (Review Focus 5)', async () => {
    state.items = [film('10', 111, 1), film('11', 112, 1)]
    state.history = [entry(1, '10', T - 50), entry(7, '11', T + 100)]
    const softDeleted = play(FILM_B, T + 100, { source: 'plex', plexHistoryId: 7, deletedAt: new Date() })
    const afterDisconnect = memoryWorld([play(FILM_A, T), softDeleted])

    const report = await runPlexLink({ connection: { ...connection, historyCursor: null }, server, rerun: false, ...afterDisconnect.stores, ...afterDisconnect })

    expect(fake.rawUrls.some(url => url.startsWith('/status/sessions/history/all') && new URL(url, 'http://x').searchParams.get('viewedAt>') === String(T - 1))).toBe(true)
    expect(afterDisconnect.plays).toHaveLength(2)
    expect(afterDisconnect.plays.find(row => row.titleId === FILM_B)!.deletedAt).toBeInstanceOf(Date)
    expect(report).toMatchObject({ pulled: { added: 0, duplicates: 0 } })
    expect(afterDisconnect.progress.at(-1)).toEqual({ historyCursor: T + 100 })
    expect([...afterDisconnect.items.keys()].toSorted()).toEqual(['10', '11'])
  })

  it('does not count a chunk as pushed when nothing was sent', async () => {
    const world = memoryWorld([play(FILM_A, T)])
    state.items = [film('10', 111, 0)]

    const report = await runPlexLink({ connection, server, rerun: false, ...world.stores, ...world, sendPush: async () => false })

    expect(report).toMatchObject({ pushed: 0, errors: 0 })
  })

  it('logs the unreachable outcome only on the final attempt', async () => {
    const world = memoryWorld()
    await fake.stop()
    await expect(runPlexLink({ connection, server, rerun: false, ...world.stores, ...world, isFinalAttempt: false })).rejects.toBeInstanceOf(PlexError)
    expect(log.info).not.toHaveBeenCalledWith(expect.anything(), 'plex link finished')
    await expect(runPlexLink({ connection, server, rerun: false, ...world.stores, ...world })).rejects.toBeInstanceOf(PlexError)
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'unreachable' }), 'plex link finished')
    fake = await startFakePlex(state)
  })
})

describe('plex-link Inngest function', () => {
  const handler = (plexLink as unknown as { handler: (input: unknown) => Promise<unknown> }).handler

  beforeEach(() => {
    syncMode = 'on'
    vi.clearAllMocks()
  })

  it('runs the link as named steps, each reloading the connection, and reports no connection as skipped', async () => {
    loadPlexConnection.mockResolvedValue(null)
    const stepIds: string[] = []
    const step = { run: async <Result>(id: string, run: () => Promise<Result>) => {
      stepIds.push(id)
      return run()
    } }

    expect(await handler({ event: { data: { userId: USER_ID, rerun: false } }, step, attempt: 0 })).toEqual({ skipped: 'no plex connection' })
    expect(stepIds).toEqual(['rebuild-item-map'])
    expect(loadPlexConnection).toHaveBeenCalledWith(USER_ID)
    expect(log.info).toHaveBeenCalledWith({ userId: USER_ID, outcome: 'no-connection' }, 'plex link finished')
    expect(queueSearchReindex).not.toHaveBeenCalled()
  })

  it('does nothing when sync is off', async () => {
    syncMode = 'off'
    const step = { run: vi.fn() }
    expect(await handler({ event: { data: { userId: USER_ID, rerun: false } }, step, attempt: 0 })).toEqual({ skipped: 'sync off' })
    expect(step.run).not.toHaveBeenCalled()
  })
})
