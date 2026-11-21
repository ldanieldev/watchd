import { beforeEach, describe, expect, it, vi } from 'vitest'
import { titles, watches } from '~~/server/db/schema'

const send = vi.fn()
vi.mock('~~/server/utils/inngest/client', () => ({ inngest: { send } }))

const { importPlays } = await import('~~/server/utils/import/writePlays')

const play = (tmdbId: number, minute: number) => ({
  kind: 'movie' as const, tmdbId, watchedAt: new Date(`2026-01-01T10:${String(minute).padStart(2, '0')}:00Z`), titleName: `Movie ${tmdbId}`
})

interface ExistingTitle { id: number, tmdbId: number, state?: 'pending' | 'ready' | 'failed', updatedAt?: Date }

function fakeDb({ newTitleIds, existing, insertedWatches }: { newTitleIds: number[], existing: ExistingTitle[], insertedWatches: number }) {
  const chain = (result: unknown) => {
    const link: Record<string, unknown> = { then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) }
    for (const method of ['values', 'onConflictDoNothing', 'returning', 'from', 'where']) link[method] = () => link
    return link
  }
  return {
    insert: (table: unknown) => chain(table === titles
      ? newTitleIds.map(id => ({ id }))
      : table === watches ? Array.from({ length: insertedWatches }, (_, id) => ({ id })) : []),
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
})
