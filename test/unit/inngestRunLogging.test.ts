import { beforeEach, describe, expect, it, vi } from 'vitest'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('../../server/utils/logger', () => ({ logger: { child: () => log } }))

const { RunLogging, outputSummary } = await import('../../server/utils/inngest/runLogging')
const { markReported } = await import('../../server/utils/inngest/reported')

const mw = new RunLogging({ client: {} as never })
const fn = (id: string) => ({ opts: { id } }) as never
const ctx = (data: Record<string, unknown> = {}, attempt = 0) => ({ runId: 'run-1', attempt, event: { data } }) as never
const stepInfo = { options: { id: 'sync-history-1-50' } } as never

beforeEach(() => vi.clearAllMocks())

describe('RunLogging', () => {
  it('logs a run start at debug with the user and job ids from the event', () => {
    mw.onRunStart({ ctx: ctx({ userId: 7, jobId: 42, payload: 'x' }), fn: fn('plex-sync') })
    expect(log.debug).toHaveBeenCalledWith(
      { fnId: 'plex-sync', runId: 'run-1', attempt: 0, userId: 7, jobId: 42 },
      'Inngest run started'
    )
  })

  it('logs a completed run at info with only count, boolean and enum output fields', () => {
    const output = {
      items: 3,
      warnings: [{ id: 'x', message: 'free text' }],
      counts: { movies: 2, shows: 0 },
      outcome: 'ok',
      error: 'Plex said: private title'
    }
    mw.onRunComplete({ ctx: ctx({ userId: 7 }), fn: fn('plex-sync'), output })
    const [fields, msg] = log.info.mock.calls[0]!
    expect(msg).toBe('Inngest run completed')
    expect(fields).toEqual({
      items: 3,
      warnings: 1,
      counts: { movies: 2, shows: 0 },
      outcome: 'ok',
      fnId: 'plex-sync',
      runId: 'run-1',
      attempt: 0,
      userId: 7
    })
  })

  it('warns on a run error with retries left and errors on the final attempt', () => {
    const error = new Error('boom')
    mw.onRunError({ ctx: ctx({ userId: 7 }, 1), fn: fn('plex-sync'), error, isFinalAttempt: false })
    expect(log.warn).toHaveBeenCalledWith(
      { err: error, fnId: 'plex-sync', runId: 'run-1', attempt: 1, userId: 7 },
      'Inngest run failed; retrying'
    )
    mw.onRunError({ ctx: ctx({ userId: 7 }, 3), fn: fn('plex-sync'), error, isFinalAttempt: true })
    expect(log.error).toHaveBeenCalledWith(
      { err: error, fnId: 'plex-sync', runId: 'run-1', attempt: 3, userId: 7 },
      'Inngest run failed'
    )
  })

  it('marks a final run error sentryCaptured when it was already reported or wraps a step failure', () => {
    const reported = markReported(new Error('logged by the domain code'))
    mw.onRunError({ ctx: ctx(), fn: fn('plex-sync'), error: reported, isFinalAttempt: true })
    const stepError = Object.assign(new Error('step failed'), { name: 'StepError' })
    mw.onRunError({ ctx: ctx(), fn: fn('plex-sync'), error: stepError, isFinalAttempt: true })
    expect(log.error.mock.calls.map(([fields]) => fields.sentryCaptured)).toEqual([true, true])
  })

  it('logs step errors with the step id at warn, then error on the final attempt', () => {
    const error = new Error('db down')
    const args = { ctx: ctx(), fn: fn('plex-sync'), error, stepInfo }
    mw.onStepError({ ...args, isFinalAttempt: false })
    mw.onStepError({ ...args, isFinalAttempt: true })
    expect(log.warn.mock.calls[0]![0]).toMatchObject({ err: error, stepId: 'sync-history-1-50' })
    expect(log.error.mock.calls[0]![0]).toMatchObject({ err: error, stepId: 'sync-history-1-50' })
    expect(log.error.mock.calls[0]![0]).not.toHaveProperty('sentryCaptured')
  })
})

describe('outputSummary', () => {
  it('reports a bare enum output as result and drops free text', () => {
    expect(outputSummary('pushed')).toEqual({ result: 'pushed' })
    expect(outputSummary('Some message with spaces')).toEqual({})
    expect(outputSummary(undefined)).toEqual({})
  })
})
