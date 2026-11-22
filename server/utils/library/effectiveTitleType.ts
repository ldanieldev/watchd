import type { TitleKind } from '../../db/schema/library'

export function effectiveTitleType(kind: TitleKind, isAnime: boolean, typeOverride: 'tv' | 'anime' | null | undefined): 'movie' | 'tv' | 'anime' {
  if (kind === 'movie') return 'movie'
  return typeOverride ?? (isAnime ? 'anime' : 'tv')
}
