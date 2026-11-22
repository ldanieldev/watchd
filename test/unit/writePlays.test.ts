import { beforeEach, describe, expect, it, vi } from 'vitest'
import { titles, userTitles, watches } from '~~/server/db/schema'

const send = vi.fn()
vi.mock('~~/server/utils/inngest/client', () => ({ inngest: { send } }))

const { importPlays } = await import('~~/server/utils/import/writePlays')

const play = (tmdbId: number, minute: number) => ({
  kind: 'movie' as const, tmdbId, watchedAt: new Date(`2026-01-01T10:${String(minute).padStart(2, '0')}:00Z`), titleName: `Movie ${tmdbId}`
})

interface ExistingTitle { id: number, tmdbId: number, state?: 'pending' | 'ready' | 'failed', updatedAt?: Date }

interface FakeDbOptions { newTitleIds: number[], existing: ExistingTitle[], insertedWatches: number, insertedTitleSettings?: number }

function fakeDb({ newTitleIds, existing, insertedWatches, insertedTitleSettings = 0 }: FakeDbOptions) {
  const insertedValues = new Map<unknown, unknown[]>()
  const conflictTargets = new Map<unknown, unknown>()
  const chain = (result: unknown, table?: unknown) => {
    const link: Record<string, unknown> = { then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) }
    for (const method of ['returning', 'from', 'where']) link[method] = () => link
    link.values = (values: unknown[]) => {
      insertedValues.set(table, [...(insertedValues.get(table) ?? []), ...values])
      return link
    }
    link.onConflictDoNothing = (config?: { target?: unknown }) => {
      conflictTargets.set(table, config?.target)
      return link
    }
    return link
  }
  const insertResult = (table: unknown) => {
    if (table === titles) return newTitleIds.map(id => ({ id }))
    if (table === watches) return Array.from({ length: insertedWatches }, (_, id) => ({ id }))
    if (table === userTitles) return Array.from({ length: insertedTitleSettings }, (_, id) => ({ id }))
    return []
  }
  return {
    insertedValues,
    conflictTargets,
    insert: (table: unknown) => chain(insertResult(table), table),
    update: vi.fn(() => chain([])),
    delete: vi.fn(() => chain([])),
    select: () => chain(existing.map(row => ({ state: 'ready', updatedAt: new Date(), ...row })))
  }
}

beforeEach(() => {
  send.mockReset()
  vi.stubGlobal('withQuerySpan', (_name: string, fn: () => Promise<unknown>) => fn())
})

describe('importPlays', () => {
  it('queues enrichment only for titles this import created', async () => {
    vi.stubGlobal('db', fakeDb({ newTitleIds: [2], existing: [{ id: 1, tmdbId: 10, state: 'pending' }, { id: 2, tmdbId: 20, state: 'pending' }], insertedWatches: 2 }))

    const summary = await importPlays(7, { plays: [play(10, 1), play(20, 2)], skipped: [] }, 'floppy')

    expect(summary).toEqual({ added: 2, duplicates: 0, skipped: [], titlesQueued: 1 })
    expect(send).toHaveBeenCalledWith([{ name: 'library/title.enrich', data: { titleId: 2 } }])
  })

  it('queues nothing when every title already existed', async () => {
    vi.stubGlobal('db', fakeDb({ newTitleIds: [], existing: [{ id: 1, tmdbId: 10 }], insertedWatches: 0 }))

    const summary = await importPlays(7, { plays: [play(10, 1)], skipped: [] }, 'trakt')

    expect(summary.titlesQueued).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('re-queues a title left pending for more than 10 minutes, so a re-upload recovers a lost enrich event', async () => {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    vi.stubGlobal('db', fakeDb({ newTitleIds: [], existing: [{ id: 1, tmdbId: 10, state: 'pending', updatedAt: hourAgo }, { id: 2, tmdbId: 20, state: 'pending' }], insertedWatches: 0 }))

    const summary = await importPlays(7, { plays: [play(10, 1), play(20, 2)], skipped: [] }, 'floppy')

    expect(summary.titlesQueued).toBe(1)
    expect(send).toHaveBeenCalledWith([{ name: 'library/title.enrich', data: { titleId: 1 } }])
  })

  it('keeps each restored play\'s own source, minutes and Plex ids', async () => {
    const fake = fakeDb({ newTitleIds: [], existing: [{ id: 1, tmdbId: 10 }], insertedWatches: 1 })
    vi.stubGlobal('db', fake)
    const restoredPlay = { ...play(10, 1), source: 'plex' as const, minutesWatched: 42, plexHistoryId: 9001, plexServerMachineId: 'machine-abc' }

    await importPlays(7, { plays: [restoredPlay], skipped: [] }, 'watchd')

    expect(fake.insertedValues.get(watches)).toEqual([expect.objectContaining({
      userId: 7, titleId: 1, source: 'plex', minutesWatched: 42, plexHistoryId: 9001, plexServerMachineId: 'machine-abc'
    })])
  })

  it('counts plays the insert skips as duplicates and leaves existing rows untouched', async () => {
    const fake = fakeDb({ newTitleIds: [], existing: [{ id: 1, tmdbId: 10 }, { id: 2, tmdbId: 20 }], insertedWatches: 1 })
    vi.stubGlobal('db', fake)

    const summary = await importPlays(7, { plays: [play(10, 1), play(20, 2)], skipped: [] }, 'watchd')

    expect(summary).toMatchObject({ added: 1, duplicates: 1 })
    expect(fake.update).not.toHaveBeenCalled()
    expect(fake.delete).not.toHaveBeenCalled()
  })

  it('adds title settings only where the account has none, stubbing a title that has no play', async () => {
    const fake = fakeDb({ newTitleIds: [2], existing: [{ id: 1, tmdbId: 10 }, { id: 2, tmdbId: 20 }], insertedWatches: 1, insertedTitleSettings: 1 })
    vi.stubGlobal('db', fake)
    const titleSettings = [
      { kind: 'movie' as const, tmdbId: 10, titleName: 'Movie 10', typeOverride: null, heldStatus: 'paused' as const },
      { kind: 'movie' as const, tmdbId: 20, titleName: 'Movie 20', typeOverride: 'anime' as const, heldStatus: null }
    ]

    const summary = await importPlays(7, { plays: [play(10, 1)], skipped: [], titleSettings }, 'watchd')

    expect(summary.titleSettings).toEqual({ added: 1, alreadySet: 1 })
    expect(fake.insertedValues.get(titles)).toContainEqual(expect.objectContaining({ kind: 'movie', tmdbId: 20, name: 'Movie 20' }))
    expect(fake.insertedValues.get(userTitles)).toEqual([
      { userId: 7, titleId: 1, typeOverride: null, heldStatus: 'paused' },
      { userId: 7, titleId: 2, typeOverride: 'anime', heldStatus: null }
    ])
    expect(fake.conflictTargets.get(userTitles)).toEqual([userTitles.userId, userTitles.titleId])
  })

  it('leaves title settings out of the summary for an import without them', async () => {
    vi.stubGlobal('db', fakeDb({ newTitleIds: [], existing: [{ id: 1, tmdbId: 10 }], insertedWatches: 1 }))

    const summary = await importPlays(7, { plays: [play(10, 1)], skipped: [] }, 'floppy')

    expect(summary).not.toHaveProperty('titleSettings')
  })
})
