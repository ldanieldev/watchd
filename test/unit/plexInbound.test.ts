import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { createFakePlexState, startFakePlex } from '../fixtures/plex/fakePlex'
import type { FakePlex, FakePlexState } from '../fixtures/plex/fakePlex'
import type { InboundItem, InboundStore, StoredInboundPlay, UnresolvedHistoryEntry } from '~~/server/utils/plex/inbound'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.mock('~~/server/utils/inngest/client', () => ({ inngest: { send: vi.fn() } }))
vi.stubGlobal('useRuntimeConfig', () => ({ plex: { syncMode: 'read-only', clientIdentifier: 'test-client-id' } }))

const { dedupeInbound, drizzleInboundStore, pullHistory } = await import('~~/server/utils/plex/inbound')
const { PlexServer } = await import('~~/server/utils/plex/client')

const at = (iso: string) => new Date(`2026-01-01T${iso}Z`)

describe('dedupeInbound', () => {
  const existing = [{ titleId: 1, season: 1, number: 2, watchedAt: at('10:00:36') }]

  it('drops a candidate 24 s after an existing play of the same episode, across a minute boundary', () => {
    expect(dedupeInbound([{ titleId: 1, season: 1, number: 2, watchedAt: at('10:01:00') }], existing)).toEqual([])
  })

  it('keeps a rewatch of the same episode 3 hours later', () => {
    const rewatch = { titleId: 1, season: 1, number: 2, watchedAt: at('13:00:36') }
    expect(dedupeInbound([rewatch], existing)).toEqual([rewatch])
  })

  it('keeps a different episode in the same minute', () => {
    const otherEpisode = { titleId: 1, season: 1, number: 3, watchedAt: at('10:00:36') }
    expect(dedupeInbound([otherEpisode], existing)).toEqual([otherEpisode])
  })

  it('treats movies (no season or number) as one key per title', () => {
    const movie = { titleId: 9, season: null, number: null, watchedAt: at('10:00:00') }
    expect(dedupeInbound([{ ...movie, watchedAt: at('10:04:00') }], [movie])).toEqual([])
  })

  it('keeps only the first of two candidates for the same episode within the window', () => {
    const first = { titleId: 1, season: 4, number: 1, watchedAt: at('11:00:00'), plexHistoryId: 1 }
    const second = { titleId: 1, season: 4, number: 1, watchedAt: at('11:02:00'), plexHistoryId: 2 }
    expect(dedupeInbound([first, second], [])).toEqual([first])
  })
})

type MemoryPlay = StoredInboundPlay & { plexServerMachineId: string | null }

function memoryInboundStore(items: Record<string, InboundItem>, existingPlays: MemoryPlay[] = []) {
  const plays: MemoryPlay[] = [...existingPlays]
  const unresolved = new Map<number, UnresolvedHistoryEntry>()
  const progress: { historyCursor: number | null, lastPlayAt?: Date }[] = []
  const store: InboundStore = {
    async mappedItems(_connectionId, ratingKeys) {
      return new Map(ratingKeys.flatMap(ratingKey => items[ratingKey] ? [[ratingKey, items[ratingKey]]] : []))
    },
    async unresolvedEntries() {
      return [...unresolved.values()]
    },
    async storedHistoryIds(_userId, serverMachineId, historyIds) {
      return new Set(plays.flatMap(play => play.plexServerMachineId === serverMachineId && play.plexHistoryId !== null && historyIds.includes(play.plexHistoryId) ? [play.plexHistoryId] : []))
    },
    async existingPlays(_userId, titleIds) {
      return plays.filter(play => titleIds.includes(play.titleId))
    },
    async insertPlays(_userId, serverMachineId, rows) {
      plays.push(...rows.map(row => ({ ...row, plexServerMachineId: serverMachineId })))
      return rows.map(row => row.plexHistoryId)
    },
    async saveUnresolved(_connectionId, entries) {
      for (const entry of entries) if (!unresolved.has(entry.historyId)) unresolved.set(entry.historyId, entry)
    },
    async removeUnresolved(_connectionId, historyIds) {
      for (const historyId of historyIds) unresolved.delete(historyId)
    },
    async saveProgress(_connectionId, update) {
      progress.push(update)
    }
  }
  return { store, plays, unresolved, progress }
}

describe('pullHistory', () => {
  const TOKEN = 'inbound-token'
  const OWNER = 1
  const OTHER_PROFILE = 342461108
  let state: FakePlexState
  let fake: FakePlex
  let server: InstanceType<typeof PlexServer>
  let connection: { id: number, userId: number, ownerAccountId: number, serverMachineId: string, sectionIds: string[], historyCursor: number | null, lastPlayAt: Date | null }
  const episodeItem: InboundItem = { kind: 'episode', titleId: 7, season: 1, number: 1090 }
  const movieItem: InboundItem = { kind: 'movie', titleId: 9, season: null, number: null }

  beforeEach(async () => {
    vi.clearAllMocks()
    state = createFakePlexState({ token: TOKEN })
    fake = await startFakePlex(state)
    server = new PlexServer({ url: fake.url, token: TOKEN })
    connection = { id: 3, userId: 42, ownerAccountId: OWNER, serverMachineId: 'server-a', sectionIds: ['1', '2'], historyCursor: null, lastPlayAt: null }
  })

  afterEach(async () => {
    await fake.stop()
  })

  async function pullAndAdvance(store: InboundStore, progress: { historyCursor: number | null }[], options?: { since?: number, newHistoryRatingKeys?: Set<string> }) {
    const result = await pullHistory(connection, server, options, store)
    if (progress.length) connection.historyCursor = progress.at(-1)!.historyCursor
    return result
  }

  it('imports only the owner\'s plays, even when Plex ignores the accountID filter', async () => {
    state.ignoreAccountFilter = true
    state.history = [
      { historyId: 1, ratingKey: '21', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 2 },
      { historyId: 2, ratingKey: '10', viewedAt: 1_700_000_100, accountId: OTHER_PROFILE, sectionId: 1 }
    ]
    const { store, plays } = memoryInboundStore({ 21: episodeItem, 10: movieItem })

    const result = await pullHistory(connection, server, {}, store)

    expect(result).toEqual({ added: 1, duplicates: 0, unresolved: 0 })
    expect(plays).toEqual([{ titleId: 7, season: 1, number: 1090, watchedAt: new Date(1_700_000_000_000), plexHistoryId: 1, plexServerMachineId: 'server-a' }])
    expect(fake.rawUrls.filter(url => url.startsWith('/status/sessions/history/all')).every(url => url.includes(`accountID=${OWNER}`))).toBe(true)
  })

  it('sends no viewedAt filter when reading from 0, and one second early otherwise', async () => {
    const { store } = memoryInboundStore({ 21: episodeItem })
    const filters = () => fake.rawUrls.filter(url => url.startsWith('/status/sessions/history/all')).flatMap(url => [...new URL(url, 'http://x').searchParams.keys()].filter(key => key.startsWith('viewedAt>')))
    await pullHistory(connection, server, { since: 0 }, store)
    expect(filters()).toEqual([])

    await pullHistory(connection, server, { since: 100 }, store)
    expect(new Set(filters())).toEqual(new Set(['viewedAt>']))
    expect(fake.rawUrls.some(url => new URL(url, 'http://x').searchParams.get('viewedAt>') === '99')).toBe(true)
  })

  it('logs each imported play at info', async () => {
    state.history = [{ historyId: 1, ratingKey: '21', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 2 }]
    const { store } = memoryInboundStore({ 21: episodeItem })

    await pullHistory(connection, server, {}, store)

    expect(log.info).toHaveBeenCalledWith(
      { userId: 42, titleId: 7, season: 1, number: 1090, watchedAt: new Date(1_700_000_000_000), plexHistoryId: 1 },
      'plex play imported'
    )
  })

  it('keeps an unmapped entry as unresolved and imports it on a later pull once its item is mapped', async () => {
    state.history = [{ historyId: 5, ratingKey: '99', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 2 }]
    const items: Record<string, InboundItem> = { 98: { kind: 'episode', titleId: 7, season: null, number: null } }
    const { store, plays, unresolved, progress } = memoryInboundStore(items)

    expect(await pullAndAdvance(store, progress)).toEqual({ added: 0, duplicates: 0, unresolved: 1 })
    expect([...unresolved.keys()]).toEqual([5])
    expect(plays).toEqual([])

    state.history = []
    items[99] = episodeItem
    expect(await pullAndAdvance(store, progress)).toEqual({ added: 1, duplicates: 0, unresolved: 0 })
    expect(plays).toEqual([expect.objectContaining({ titleId: 7, season: 1, number: 1090, plexHistoryId: 5 })])
    expect(unresolved.size).toBe(0)
  })

  it('treats an item without a resolved episode as unresolved', async () => {
    state.history = [{ historyId: 6, ratingKey: '98', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 2 }]
    const { store, unresolved } = memoryInboundStore({ 98: { kind: 'episode', titleId: 7, season: null, number: null } })

    expect(await pullHistory(connection, server, {}, store)).toEqual({ added: 0, duplicates: 0, unresolved: 1 })
    expect(unresolved.has(6)).toBe(true)
  })

  it('stores one row when the same entry is pulled twice, even from a stale cursor', async () => {
    state.history = [{ historyId: 1, ratingKey: '21', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 2 }]
    const { store, plays } = memoryInboundStore({ 21: episodeItem })

    await pullHistory(connection, server, {}, store)
    const second = await pullHistory(connection, server, {}, store)

    expect(second).toEqual({ added: 0, duplicates: 0, unresolved: 0 })
    expect(plays).toHaveLength(1)
  })

  it('does not lose a later entry that shares the cursor\'s second', async () => {
    state.history = [{ historyId: 1, ratingKey: '21', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 2 }]
    const { store, plays, progress } = memoryInboundStore({ 21: episodeItem, 10: movieItem })
    await pullAndAdvance(store, progress)

    state.history.push({ historyId: 2, ratingKey: '10', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 1 })
    const result = await pullAndAdvance(store, progress)

    expect(result).toEqual({ added: 1, duplicates: 0, unresolved: 0 })
    expect(plays.map(play => play.plexHistoryId)).toEqual([1, 2])
  })

  it('reports the rating keys of entries not stored before, not an entry refetched at the cursor\'s second', async () => {
    state.history = [{ historyId: 1, ratingKey: '21', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 2 }]
    const { store, progress } = memoryInboundStore({ 21: episodeItem, 10: movieItem })
    const firstPull = new Set<string>()
    await pullAndAdvance(store, progress, { newHistoryRatingKeys: firstPull })

    state.history.push({ historyId: 2, ratingKey: '10', viewedAt: 1_700_000_500, accountId: OWNER, sectionId: 1 }, { historyId: 3, ratingKey: '77', viewedAt: 1_700_000_600, accountId: OWNER, sectionId: 1 })
    const secondPull = new Set<string>()
    await pullAndAdvance(store, progress, { newHistoryRatingKeys: secondPull })

    expect([...firstPull]).toEqual(['21'])
    expect([...secondPull].toSorted()).toEqual(['10', '77'])
  })

  it('advances historyCursor to the max viewedAt and never moves it back', async () => {
    state.history = [
      { historyId: 1, ratingKey: '21', viewedAt: 1_700_000_300, accountId: OWNER, sectionId: 2 },
      { historyId: 2, ratingKey: '10', viewedAt: 1_700_000_900, accountId: OWNER, sectionId: 1 }
    ]
    const { store, progress } = memoryInboundStore({ 21: episodeItem, 10: movieItem })

    await pullAndAdvance(store, progress)
    expect(progress.at(-1)!.historyCursor).toBe(1_700_000_900)

    await pullAndAdvance(store, progress, { since: 1_600_000_000 })
    expect(progress.at(-1)!.historyCursor).toBe(1_700_000_900)
  })

  it('reads history only after since when given, and keeps since as the cursor when nothing newer exists', async () => {
    state.history = [{ historyId: 1, ratingKey: '10', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 1 }]
    const { store, plays, progress } = memoryInboundStore({ 10: movieItem })

    expect(await pullHistory(connection, server, { since: 1_800_000_000 }, store)).toEqual({ added: 0, duplicates: 0, unresolved: 0 })
    expect(plays).toEqual([])
    expect(progress).toEqual([{ historyCursor: 1_800_000_000 }])
  })

  it('sets lastPlayAt to the newest added play, and leaves it alone when nothing was added', async () => {
    state.history = [
      { historyId: 1, ratingKey: '21', viewedAt: 1_700_000_300, accountId: OWNER, sectionId: 2 },
      { historyId: 2, ratingKey: '10', viewedAt: 1_700_000_900, accountId: OWNER, sectionId: 1 }
    ]
    const { store, progress } = memoryInboundStore({ 21: episodeItem, 10: movieItem })

    await pullAndAdvance(store, progress)
    expect(progress.at(-1)!.lastPlayAt).toEqual(new Date(1_700_000_900_000))

    await pullAndAdvance(store, progress)
    expect(progress.at(-1)).not.toHaveProperty('lastPlayAt')
  })

  it('does not move lastPlayAt back when a retried old entry is the only play added', async () => {
    state.history = [{ historyId: 5, ratingKey: '10', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 1 }]
    connection.lastPlayAt = new Date(1_750_000_000_000)
    const { store, progress } = memoryInboundStore({ 10: movieItem })

    expect((await pullHistory(connection, server, {}, store)).added).toBe(1)
    expect(progress).toEqual([{ historyCursor: 1_700_000_000 }])
  })

  it('imports a history id that matches a stored play from a different Plex server', async () => {
    state.history = [{ historyId: 7, ratingKey: '10', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 1 }]
    const fromServerA: MemoryPlay = { titleId: 9, season: null, number: null, watchedAt: new Date(1_600_000_000_000), plexHistoryId: 7, plexServerMachineId: 'server-a' }
    const { store, plays } = memoryInboundStore({ 10: movieItem }, [fromServerA])
    connection.serverMachineId = 'server-b'

    expect(await pullHistory(connection, server, {}, store)).toEqual({ added: 1, duplicates: 0, unresolved: 0 })
    expect(plays.at(-1)).toMatchObject({ plexHistoryId: 7, plexServerMachineId: 'server-b' })
  })

  it('stops retrying unresolved entries of a section no longer chosen, and deletes them', async () => {
    state.history = [
      { historyId: 1, ratingKey: '91', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 1 },
      { historyId: 2, ratingKey: '92', viewedAt: 1_700_000_001, accountId: OWNER, sectionId: 2 }
    ]
    const items: Record<string, InboundItem> = {}
    const { store, plays, unresolved, progress } = memoryInboundStore(items)
    expect((await pullAndAdvance(store, progress)).unresolved).toBe(2)

    connection.sectionIds = ['2']
    state.history = []
    items[91] = movieItem
    const result = await pullAndAdvance(store, progress)

    expect(result).toEqual({ added: 0, duplicates: 0, unresolved: 1 })
    expect(plays).toEqual([])
    expect([...unresolved.keys()]).toEqual([2])
  })

  it('counts a play already recorded by an import within 5 minutes as a duplicate', async () => {
    state.history = [{ historyId: 1, ratingKey: '10', viewedAt: 1_700_000_100, accountId: OWNER, sectionId: 1 }]
    const imported: MemoryPlay = { titleId: 9, season: null, number: null, watchedAt: new Date(1_700_000_000_000), plexHistoryId: null, plexServerMachineId: null }
    const { store, plays } = memoryInboundStore({ 10: movieItem }, [imported])

    expect(await pullHistory(connection, server, {}, store)).toEqual({ added: 0, duplicates: 1, unresolved: 0 })
    expect(plays).toEqual([imported])
  })

  it('does not bring back a play the user soft-deleted', async () => {
    state.history = [{ historyId: 1, ratingKey: '10', viewedAt: 1_700_000_000, accountId: OWNER, sectionId: 1 }]
    const softDeleted: MemoryPlay = { titleId: 9, season: null, number: null, watchedAt: new Date(1_700_000_030_000), plexHistoryId: null, plexServerMachineId: null }
    const { store, plays } = memoryInboundStore({ 10: movieItem }, [softDeleted])

    await pullHistory(connection, server, {}, store)

    expect(plays).toEqual([softDeleted])
  })
})

describe('drizzleInboundStore', () => {
  const dialect = new PgDialect()
  const renderedWheres: string[] = []

  beforeEach(() => {
    renderedWheres.length = 0
    const chain: Record<string, unknown> = { then: (resolve: (value: unknown) => unknown) => Promise.resolve([]).then(resolve) }
    for (const method of ['from', 'innerJoin', 'orderBy']) chain[method] = () => chain
    chain.where = (condition: SQL) => {
      renderedWheres.push(dialect.sqlToQuery(condition).sql)
      return chain
    }
    vi.stubGlobal('db', { select: () => chain })
    vi.stubGlobal('withQuerySpan', (_name: string, fn: () => Promise<unknown>) => fn())
  })

  it('compares against soft-deleted plays too, scoped to the user', async () => {
    await drizzleInboundStore.existingPlays(42, [9])
    await drizzleInboundStore.storedHistoryIds(42, 'server-a', [1])

    expect(renderedWheres).toHaveLength(2)
    for (const sql of renderedWheres) {
      expect(sql).toContain('"watches"."user_id" = $1')
      expect(sql).not.toContain('deleted_at')
    }
    expect(renderedWheres[1]).toContain('"watches"."plex_server_machine_id" = $2')
  })

  it('reads item mappings and unresolved entries for the connection only', async () => {
    await drizzleInboundStore.mappedItems(3, ['21'])
    await drizzleInboundStore.unresolvedEntries(3)

    expect(renderedWheres[0]).toContain('"plex_items"."connection_id" = $1')
    expect(renderedWheres[1]).toContain('"plex_unresolved_history"."connection_id" = $1')
  })
})
