import { describe, it, expect, vi } from 'vitest'

const startSpan = vi.hoisted(() => vi.fn((_options: unknown, fn: () => unknown) => fn()))
vi.mock('@sentry/nuxt', () => ({ startSpan, getActiveSpan: () => undefined }))
vi.mock('../../server/db/schema', () => ({}))

const { withQuerySpan } = await import('../../server/utils/db')

describe('withQuerySpan', () => {
  it('wraps the callback in a Sentry db.query span named after the operation and returns its result', async () => {
    const result = await withQuerySpan('test-query', async () => 42)

    expect(result).toBe(42)
    expect(startSpan).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'test-query', op: 'db.query' }),
      expect.any(Function)
    )
  })

  it('rethrows the callback error', async () => {
    await expect(withQuerySpan('failing-query', () => Promise.reject(new Error('db down')))).rejects.toThrow('db down')
  })
})
