import type { Index } from 'meilisearch'
import { isIndexNotFound, libraryTitlesIndex, requireTaskSucceeded } from './meili'
import { loadLibraryTitleDocuments } from './libraryTitleDocuments'
import type { LibraryTitleDocument } from './libraryTitleDocuments'

const PAGE_SIZE = 1000

function fingerprint(document: LibraryTitleDocument): string {
  return JSON.stringify([document.name, document.originalName, document.alternativeNames, document.year, document.category, document.posterPath])
}

async function loadIndexedDocuments(userId: number, index: Index<LibraryTitleDocument>): Promise<LibraryTitleDocument[]> {
  const indexed: LibraryTitleDocument[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { results } = await index.getDocuments({ filter: `userId = ${userId}`, limit: PAGE_SIZE, offset })
    indexed.push(...results)
    if (results.length < PAGE_SIZE) return indexed
  }
}

export async function reindexUserSearch(userId: number, index: Index<LibraryTitleDocument> = libraryTitlesIndex()): Promise<{ upserted: number, deleted: number }> {
  const [wanted, indexed] = await Promise.all([loadLibraryTitleDocuments(userId), loadIndexedDocuments(userId, index)])
  const indexedByTitleId = new Map(indexed.map(document => [document.titleId, document]))
  const wantedTitleIds = new Set(wanted.map(document => document.titleId))

  const changed = wanted.filter((document) => {
    const existing = indexedByTitleId.get(document.titleId)
    return !existing || fingerprint(existing) !== fingerprint(document)
  })
  const staleTitleIds = indexed.map(document => document.titleId).filter(titleId => !wantedTitleIds.has(titleId))

  if (changed.length) await requireTaskSucceeded(index.addDocuments(changed, { primaryKey: 'id' }).waitTask())
  if (staleTitleIds.length) await requireTaskSucceeded(index.deleteDocuments({ filter: `userId = ${userId} AND titleId IN [${staleTitleIds.join(', ')}]` }).waitTask())
  return { upserted: changed.length, deleted: staleTitleIds.length }
}

export async function deleteUserSearchDocuments(userId: number, index: Index<LibraryTitleDocument> = libraryTitlesIndex()): Promise<void> {
  try {
    await requireTaskSucceeded(index.deleteDocuments({ filter: `userId = ${userId}` }).waitTask())
  } catch (error) {
    if (!isIndexNotFound(error)) throw error
  }
}
