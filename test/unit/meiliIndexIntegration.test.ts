import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Meilisearch } from 'meilisearch'
import type { LibraryTitleDocument } from '~~/server/utils/search/libraryTitleDocuments'

vi.stubGlobal('useRuntimeConfig', () => ({ meili: { host: 'http://127.0.0.1:7700', apiKey: '' } }))

const reachable = await fetch('http://127.0.0.1:7700/health').then(response => response.ok, () => false)
const uid = `test_library_titles_${Math.random().toString(36).slice(2)}`

function doc(userId: number, titleId: number, name: string, extra: Partial<LibraryTitleDocument> = {}): LibraryTitleDocument {
  return { id: `${userId}_${titleId}`, userId, titleId, name, originalName: null, alternativeNames: [], year: null, category: 'tv', posterPath: null, ...extra }
}

describe.skipIf(!reachable)('library titles index', () => {
  const client = new Meilisearch({ host: 'http://127.0.0.1:7700' })
  const index = client.index<LibraryTitleDocument>(uid)

  beforeAll(async () => {
    const { ensureLibraryTitlesIndex } = await import('~~/server/utils/search/meili')
    await ensureLibraryTitlesIndex(index)
    const task = await index.addDocuments([
      doc(1, 1, 'Dark'),
      doc(1, 2, 'Lost'),
      doc(1, 3, 'Attack on Titan', { originalName: '進撃の巨人', alternativeNames: ['Shingeki no Kyojin', 'AOT'], category: 'anime' }),
      doc(2, 1, 'Dark'),
      doc(2, 2, 'Lost')
    ], { primaryKey: 'id' }).waitTask()
    expect(task.status).toBe('succeeded')
  })

  afterAll(async () => {
    await client.deleteIndex(uid).waitTask()
  })

  async function namesFor(query: string) {
    const { hits } = await index.search(query, { filter: 'userId = 1' })
    return hits.map(hit => hit.name)
  }

  it('finds titles through typos, aliases and the Japanese original name', async () => {
    expect(await namesFor('drak')).toEqual(['Dark'])
    expect(await namesFor('lsot')).toEqual(['Lost'])
    expect(await namesFor('shingeki')).toEqual(['Attack on Titan'])
    expect(await namesFor('進撃')).toEqual(['Attack on Titan'])
    expect(await namesFor('drk')).toEqual([])
  })
})
