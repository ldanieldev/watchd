import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strToU8 } from 'fflate'
import { createServerHandlerHarness, event, type MultipartPart } from './serverHandlerHarness'

const importPlays = vi.fn()
const queueSearchReindex = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/search/searchEvents', () => ({ queueSearchReindex }))
vi.mock('~~/server/utils/import/writePlays', () => ({ importPlays }))
vi.mock('~~/server/utils/inngest/client', () => ({ inngest: { send: vi.fn() } }))

const harness = createServerHandlerHarness()

type Handler = (e: unknown) => Promise<unknown>
const runImport = (await import('~~/server/api/import/[source].post')).default as Handler
const status = (await import('~~/server/api/import/status.get')).default as Handler
const retryFailed = (await import('~~/server/api/import/retry-failed.post')).default as Handler

const floppyCsv = 'row_type,media_id,media_type,title,end_date\nmedia,603,movie,The Matrix,2020-01-02 03:04:00+00:00\n'
const traktJson = JSON.stringify([{ watched_at: '2026-07-13T04:41:00.000Z', type: 'movie', movie: { title: 'Dune', ids: { tmdb: 438631 } } }])
const watchdBackupJson = (version: number) => JSON.stringify({
  format: 'watchd-backup', version, exportedAt: '2026-11-21T09:00:00.000Z', titleSettings: [],
  plays: [{
    kind: 'movie', tmdbId: 603, titleName: 'The Matrix', season: null, number: null, watchedAt: '2020-01-02T03:04:00.000Z',
    minutesWatched: null, source: 'trakt', plexHistoryId: null, plexServerMachineId: null
  }]
})
const file = (filename: string, text: string): MultipartPart => ({ name: 'file', filename, data: strToU8(text) })
const upload = (source: string, multipart?: MultipartPart[]) => event({ params: { source }, multipart })
const summary = { added: 1, duplicates: 0, skipped: [], titlesQueued: 1 }

beforeEach(() => {
  harness.reset()
  importPlays.mockReset().mockResolvedValue(summary)
  queueSearchReindex.mockReset().mockResolvedValue(undefined)
  harness.setSession({ user: { id: 7 } })
})

describe('POST /api/import/:source', () => {
  it('sends search/library.changed for the user after the import', async () => {
    await runImport(upload('floppy', [file('f.csv', floppyCsv)]))

    expect(queueSearchReindex).toHaveBeenCalledWith([7])
    expect(queueSearchReindex.mock.invocationCallOrder[0]).toBeGreaterThan(importPlays.mock.invocationCallOrder[0]!)
  })

  it('still sends search/library.changed when the import fails partway, and rethrows', async () => {
    const partwayFailure = new Error('connection lost after the first batch')
    importPlays.mockRejectedValue(partwayFailure)

    await expect(runImport(upload('floppy', [file('f.csv', floppyCsv)]))).rejects.toBe(partwayFailure)

    expect(queueSearchReindex).toHaveBeenCalledWith([7])
  })

  it('rejects a request without a session with 401', async () => {
    harness.setSession({})

    await expect(runImport(upload('floppy', [file('f.csv', floppyCsv)]))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects an upload over 100 MB with 413 before reading it', async () => {
    const oversized = { ...upload('floppy', [file('f.csv', floppyCsv)]), headers: { 'content-length': String(101 * 1024 * 1024) } }

    await expect(runImport(oversized)).rejects.toMatchObject({
      statusCode: 413, statusMessage: 'That file is over 100 MB, which is larger than any export or backup.'
    })
    expect(importPlays).not.toHaveBeenCalled()
  })

  it('rejects an upload without a Content-Length that streams past 100 MB with 413', async () => {
    const oneMebibyte = new Uint8Array(1024 * 1024)
    let sent = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 101) controller.enqueue(oneMebibyte)
        else controller.close()
      }
    })

    await expect(runImport({ ...upload('floppy', [file('f.csv', floppyCsv)]), stream })).rejects.toMatchObject({ statusCode: 413 })
    expect(importPlays).not.toHaveBeenCalled()
  })

  it('rejects an unknown source with 400', async () => {
    await expect(runImport(upload('imdb', [file('f.csv', floppyCsv)]))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a request without a file with 400', async () => {
    await expect(runImport(upload('floppy', []))).rejects.toMatchObject({ statusCode: 400 })
    await expect(runImport(upload('floppy'))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a Trakt file sent to the Floppy importer, naming the expected export', async () => {
    await expect(runImport(upload('floppy', [file('watched-history-1.json', traktJson)])))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'This doesn\'t look like a Floppy export.' })
  })

  it('rejects a Floppy file sent to the Trakt importer, naming the expected export', async () => {
    await expect(runImport(upload('trakt', [file('floppy.csv', floppyCsv)])))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'This doesn\'t look like a Trakt export.' })
  })

  it('imports a Floppy file for the session user and returns the summary', async () => {
    await expect(runImport(upload('floppy', [file('f.csv', floppyCsv)]))).resolves.toEqual(summary)

    expect(importPlays).toHaveBeenCalledWith(7, expect.objectContaining({ plays: [expect.objectContaining({ tmdbId: 603 })] }), 'floppy')
  })

  it('imports every Trakt file in one request', async () => {
    await runImport(upload('trakt', [file('watched-history-1.json', traktJson), file('watched-history-2.json', traktJson)]))

    expect(importPlays.mock.calls[0]?.[1].plays).toHaveLength(2)
    expect(importPlays.mock.calls[0]?.[2]).toBe('trakt')
  })
})

describe('POST /api/import/watchd', () => {
  it('restores a backup for the session user through the watchd source', async () => {
    await runImport(upload('watchd', [file('watchd-backup-2026-11-21.json', watchdBackupJson(1))]))

    expect(importPlays).toHaveBeenCalledWith(7, expect.objectContaining({
      plays: [expect.objectContaining({ tmdbId: 603, source: 'trakt' })], titleSettings: []
    }), 'watchd')
  })

  it('rejects a backup from a newer version of watchd with 400', async () => {
    await expect(runImport(upload('watchd', [file('watchd-backup.json', watchdBackupJson(2))])))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'This backup is from a newer version of watchd.' })
    expect(importPlays).not.toHaveBeenCalled()
  })

  it('rejects a file that is not a backup with 400', async () => {
    await expect(runImport(upload('watchd', [file('floppy.csv', floppyCsv)])))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'This doesn\'t look like a Watchd backup.' })
  })
})

describe('import status and retry', () => {
  it('require a session', async () => {
    harness.setSession({})

    await expect(status(event())).rejects.toMatchObject({ statusCode: 401 })
    await expect(retryFailed(event())).rejects.toMatchObject({ statusCode: 401 })
  })
})
