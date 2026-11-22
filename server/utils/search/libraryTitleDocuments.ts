import { and, eq } from 'drizzle-orm'
import { titles, userTitles } from '~~/server/db/schema'
import type { TitleKind } from '~~/server/db/schema/library'
import { effectiveTitleType } from '../library/effectiveTitleType'
import { inUserLibrary } from '../library/libraryTitleCondition'

export interface LibraryTitleDocument {
  id: string
  userId: number
  titleId: number
  name: string
  originalName: string | null
  alternativeNames: string[]
  year: string | null
  category: 'movie' | 'tv' | 'anime'
  posterPath: string | null
}

export interface LibraryTitleRow {
  id: number
  kind: TitleKind
  name: string
  originalName: string | null
  alternativeNames: string[] | null
  firstAired: string | null
  posterPath: string | null
  isAnime: boolean
  typeOverride: 'tv' | 'anime' | null
}

export function toLibraryTitleDocument(userId: number, row: LibraryTitleRow): LibraryTitleDocument {
  return {
    id: `${userId}_${row.id}`,
    userId,
    titleId: row.id,
    name: row.name,
    originalName: row.originalName,
    alternativeNames: row.alternativeNames ?? [],
    year: row.firstAired?.slice(0, 4) || null,
    category: effectiveTitleType(row.kind, row.isAnime, row.typeOverride),
    posterPath: row.posterPath
  }
}

export async function loadLibraryTitleDocuments(userId: number): Promise<LibraryTitleDocument[]> {
  const rows = await withQuerySpan('select-library-title-documents', () =>
    db.select({
      id: titles.id,
      kind: titles.kind,
      name: titles.name,
      originalName: titles.originalName,
      alternativeNames: titles.alternativeNames,
      firstAired: titles.firstAired,
      posterPath: titles.posterPath,
      isAnime: titles.isAnime,
      typeOverride: userTitles.typeOverride
    })
      .from(titles)
      .leftJoin(userTitles, and(eq(userTitles.titleId, titles.id), eq(userTitles.userId, userId)))
      .where(inUserLibrary(titles.id, userId)))
  return rows.map(row => toLibraryTitleDocument(userId, row))
}
