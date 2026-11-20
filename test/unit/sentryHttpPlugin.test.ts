import { createError, type H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({
  withIsolationScope: vi.fn((fn: () => unknown) => fn()),
  startSpan: vi.fn((_options: unknown, fn: (span: unknown) => unknown) =>
    fn({ updateName: vi.fn(), setAttribute: vi.fn() })),
  setTag: vi.fn(),
  captureException: vi.fn(),
  getActiveSpan: () => undefined
}))
vi.mock('@sentry/nuxt', () => sentry)
vi.mock('../../server/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
vi.stubGlobal('getResponseStatus', () => 200)
const { default: plugin } = await import('../../server/plugins/sentryHttp')
const { expectedFailure } = await import('../../server/utils/expectedFailure')

function wrap(inner: () => unknown) {
  const app = { h3App: { handler: inner } }
  plugin(app as never)
  return app.h3App.handler as (event: H3Event) => Promise<unknown>
}

const event = () => ({ method: 'GET', path: '/api/x', context: {} }) as unknown as H3Event

beforeEach(() => vi.clearAllMocks())

describe('sentryHttp plugin', () => {
  it('captures an unexpected 5xx inside the request scope, then rethrows it', async () => {
    const err = new Error('boom')
    await expect(wrap(() => Promise.reject(err))(event())).rejects.toBe(err)
    expect(sentry.captureException).toHaveBeenCalledWith(err, expect.anything())
  })

  it('leaves a handled 4xx uncaptured', async () => {
    await expect(wrap(() => Promise.reject(createError({ statusCode: 400 })))(event())).rejects.toThrow()
    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('leaves a 5xx marked as an expected failure uncaptured', async () => {
    await expect(wrap(() => Promise.reject(expectedFailure({ statusCode: 502 })))(event())).rejects.toThrow()
    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('tags each request with its own requestId', async () => {
    const e = event()
    await wrap(() => Promise.resolve('ok'))(e)
    expect(sentry.setTag).toHaveBeenCalledWith('requestId', e.context.requestId)
  })
})
