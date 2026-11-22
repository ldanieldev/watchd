import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('useRuntimeConfig', () => ({ meili: { host: 'http://meili.invalid', apiKey: '' } }))
const { ensureLibraryTitlesIndex, meiliClient } = await import('~~/server/utils/search/meili')

describe('meiliClient', () => {
  it('gives up on a request after 3 seconds', () => {
    expect(meiliClient().config.timeout).toBe(3000)
  })
})

describe('ensureLibraryTitlesIndex', () => {
  it('rethrows an error that does not mean the index is missing', async () => {
    const unreachable = new Error('fetch failed')
    const index = { uid: 'library_titles', getRawInfo: vi.fn().mockRejectedValue(unreachable), updateSettings: vi.fn() }

    await expect(ensureLibraryTitlesIndex(index as never)).rejects.toBe(unreachable)
    expect(index.updateSettings).not.toHaveBeenCalled()
  })
})
