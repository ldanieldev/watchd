import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryTitleDocument } from '~~/server/utils/search/libraryTitleDocuments'

const loadLibraryTitleDocuments = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/search/libraryTitleDocuments', () => ({ loadLibraryTitleDocuments }))

const { reindexUserSearch, deleteUserSearchDocuments } = await import('~~/server/utils/search/reindexUserSearch')

function doc(titleId: number, name: string): LibraryTitleDocument {
  return { id: `5_${titleId}`, userId: 5, titleId, name, originalName: null, alternativeNames: [], year: null, category: 'tv', posterPath: null }
}

const task = () => ({ waitTask: async () => ({ status: 'succeeded' }) })

function fakeIndex(indexed: LibraryTitleDocument[]) {
  return {
    getDocuments: vi.fn(async ({ offset = 0, limit = 1000 }: { offset?: number, limit?: number }) => ({ results: indexed.slice(offset, offset + limit), total: indexed.length })),
    addDocuments: vi.fn(task),
    deleteDocuments: vi.fn(task)
  }
}

beforeEach(() => loadLibraryTitleDocuments.mockReset())

describe('reindexUserSearch', () => {
  it('upserts only documents that differ from what is indexed', async () => {
    const index = fakeIndex([doc(1, 'A'), doc(2, 'old B')])
    loadLibraryTitleDocuments.mockResolvedValue([doc(1, 'A'), doc(2, 'B')])

    const result = await reindexUserSearch(5, index as never)

    expect(index.addDocuments).toHaveBeenCalledTimes(1)
    expect(index.addDocuments).toHaveBeenCalledWith([doc(2, 'B')], { primaryKey: 'id' })
    expect(result).toEqual({ upserted: 1, deleted: 0 })
  })

  it('deletes the user\'s documents for titles no longer in the library', async () => {
    const index = fakeIndex([doc(1, 'A'), doc(3, 'C')])
    loadLibraryTitleDocuments.mockResolvedValue([doc(1, 'A')])

    const result = await reindexUserSearch(5, index as never)

    expect(index.deleteDocuments).toHaveBeenCalledWith({ filter: 'userId = 5 AND titleId IN [3]' })
    expect(index.addDocuments).not.toHaveBeenCalled()
    expect(result).toEqual({ upserted: 0, deleted: 1 })
  })

  it('writes nothing when nothing changed', async () => {
    const index = fakeIndex([doc(1, 'A')])
    loadLibraryTitleDocuments.mockResolvedValue([doc(1, 'A')])

    await reindexUserSearch(5, index as never)

    expect(index.addDocuments).not.toHaveBeenCalled()
    expect(index.deleteDocuments).not.toHaveBeenCalled()
  })

  it('pages through more than 1000 indexed documents', async () => {
    const indexed = Array.from({ length: 1001 }, (_, position) => doc(position + 1, `T${position}`))
    const index = fakeIndex(indexed)
    loadLibraryTitleDocuments.mockResolvedValue(indexed)

    await reindexUserSearch(5, index as never)

    expect(index.getDocuments).toHaveBeenNthCalledWith(1, expect.objectContaining({ filter: 'userId = 5', limit: 1000, offset: 0 }))
    expect(index.getDocuments).toHaveBeenNthCalledWith(2, expect.objectContaining({ filter: 'userId = 5', limit: 1000, offset: 1000 }))
    expect(index.getDocuments).toHaveBeenCalledTimes(2)
    expect(index.addDocuments).not.toHaveBeenCalled()
  })

  it('throws when a task fails', async () => {
    const index = fakeIndex([])
    index.addDocuments.mockReturnValue({ waitTask: async () => ({ status: 'failed', error: { message: 'boom' } }) } as never)
    loadLibraryTitleDocuments.mockResolvedValue([doc(1, 'A')])

    await expect(reindexUserSearch(5, index as never)).rejects.toThrow('boom')
  })
})

describe('deleteUserSearchDocuments', () => {
  it('deletes by filter userId = 5', async () => {
    const index = fakeIndex([])

    await deleteUserSearchDocuments(5, index as never)

    expect(index.deleteDocuments).toHaveBeenCalledWith({ filter: 'userId = 5' })
  })

  it('treats a missing index as nothing to delete', async () => {
    const index = fakeIndex([])
    const indexNotFound = { message: 'Index `library_titles` not found.', code: 'index_not_found', type: 'invalid_request', link: '' }
    index.deleteDocuments.mockReturnValue({ waitTask: async () => ({ status: 'failed', error: indexNotFound }) } as never)

    await expect(deleteUserSearchDocuments(5, index as never)).resolves.toBeUndefined()
  })

  it('rethrows any other task failure', async () => {
    const index = fakeIndex([])
    index.deleteDocuments.mockReturnValue({ waitTask: async () => ({ status: 'failed', error: { message: 'boom', code: 'internal' } }) } as never)

    await expect(deleteUserSearchDocuments(5, index as never)).rejects.toThrow('Meilisearch task failed: boom')
  })
})
