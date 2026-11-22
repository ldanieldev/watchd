import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServerHandlerHarness } from './serverHandlerHarness'

const queueEnrichment = vi.hoisted(() => vi.fn())
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('~~/server/utils/import/writePlays', () => ({ queueEnrichment }))
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)

const harness = createServerHandlerHarness()
const { backfillTitleNames } = await import('~~/server/plugins/backfillTitleNames')

beforeEach(() => {
  queueEnrichment.mockReset().mockResolvedValue(undefined)
  harness.reset()
})

describe('backfillTitleNames', () => {
  it('queues enrichment for ready titles never given alternative names', async () => {
    harness.givenDb({ select: [[{ id: 4 }, { id: 9 }]] })

    expect(await backfillTitleNames()).toBe(2)

    expect(queueEnrichment).toHaveBeenCalledWith([4, 9], { eventIdForTitle: expect.any(Function) })
    const { eventIdForTitle } = queueEnrichment.mock.calls[0]![1] as { eventIdForTitle: (titleId: number) => string }
    expect([4, 9].map(eventIdForTitle)).toEqual(['backfill-names-4', 'backfill-names-9'])
    expect(log.info).toHaveBeenCalledWith({ queued: 2 }, expect.any(String))
  })

  it('does nothing when every title has names', async () => {
    harness.givenDb({ select: [[]] })

    expect(await backfillTitleNames()).toBe(0)

    expect(queueEnrichment).not.toHaveBeenCalled()
  })
})
