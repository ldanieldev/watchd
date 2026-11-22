import { Meilisearch, MeilisearchApiError } from 'meilisearch'
import type { Index } from 'meilisearch'
import type { LibraryTitleDocument } from './libraryTitleDocuments'

export const LIBRARY_TITLES_INDEX = 'library_titles'

const MEILI_REQUEST_TIMEOUT_MS = 3000

export class MeilisearchTaskFailedError extends Error {
  constructor(readonly code: string | undefined, message: string) {
    super(message)
    this.name = 'MeilisearchTaskFailedError'
  }
}

export function meiliClient(): Meilisearch {
  const { host, apiKey } = useRuntimeConfig().meili
  return new Meilisearch({ host, apiKey, timeout: MEILI_REQUEST_TIMEOUT_MS })
}

export function libraryTitlesIndex(): Index<LibraryTitleDocument> {
  return meiliClient().index<LibraryTitleDocument>(LIBRARY_TITLES_INDEX)
}

export function isIndexNotFound(error: unknown): boolean {
  if (error instanceof MeilisearchTaskFailedError) return error.code === 'index_not_found'
  return error instanceof MeilisearchApiError && error.cause?.code === 'index_not_found'
}

export async function requireTaskSucceeded(task: PromiseLike<{ status: string, error?: { message?: string, code?: string } | null }>): Promise<void> {
  const settled = await task
  if (settled.status === 'failed') throw new MeilisearchTaskFailedError(settled.error?.code, `Meilisearch task failed: ${settled.error?.message ?? 'unknown error'}`)
}

export async function ensureLibraryTitlesIndex(index: Index<LibraryTitleDocument> = libraryTitlesIndex()): Promise<void> {
  const exists = await index.getRawInfo().then(() => true, (error: unknown) => {
    if (isIndexNotFound(error)) return false
    throw error
  })
  if (!exists) await requireTaskSucceeded(meiliClient().createIndex(index.uid, { primaryKey: 'id' }).waitTask())
  await requireTaskSucceeded(index.updateSettings({
    searchableAttributes: ['name', 'originalName', 'alternativeNames'],
    filterableAttributes: ['userId', 'titleId', 'category'],
    typoTolerance: { minWordSizeForTypos: { oneTypo: 4, twoTypos: 9 } },
    localizedAttributes: [{ attributePatterns: ['originalName'], locales: ['jpn'] }]
  }).waitTask())
}
