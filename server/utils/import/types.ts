import type { SkippedRow } from '../../../shared/types/library'
import type { TitleKind } from '../../db/schema/library'

export interface ImportedPlay {
  kind: TitleKind
  tmdbId: number
  season?: number
  number?: number
  watchedAt: Date
  titleName: string
  posterPath?: string
  firstAired?: string
  runtimeMinutes?: number
}

export interface ParsedImport {
  plays: ImportedPlay[]
  skipped: SkippedRow[]
}

export class NotAnExportError extends Error {}
