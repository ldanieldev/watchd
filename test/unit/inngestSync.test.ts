import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncInngest, syncSignature } from '../../scripts/inngest-sync'

describe('syncSignature', () => {
  const expected = createHmac('sha256', 'abcd').update('1700000000').digest('hex')

  it('signs the timestamp over an empty body', () => {
    expect(syncSignature('abcd', '1700000000')).toBe(`t=1700000000&s=${expected}`)
  })

  it('drops the signkey prefix before signing', () => {
    expect(syncSignature('signkey-prod-abcd', '1700000000')).toBe(`t=1700000000&s=${expected}`)
  })
})

describe('syncInngest', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends a signed PUT to the serve route', async () => {
    const fetchMock = vi.fn(async () => new Response('{"modified":true}'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(syncInngest('http://app:3000', 'abcd')).resolves.toBe('{"modified":true}')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.href).toBe('http://app:3000/api/inngest')
    expect(init.method).toBe('PUT')
    expect((init.headers as Record<string, string>)['X-Inngest-Signature']).toMatch(/^t=\d+&s=[0-9a-f]{64}$/)
  })

  it('throws on a refused sync, so the one-shot exits non-zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })))
    await expect(syncInngest('http://app:3000', 'abcd')).rejects.toThrow('Inngest sync failed: 401 nope')
  })
})
