export type SearchCategory = 'all' | 'movie' | 'tv' | 'anime'

export interface SearchHit {
  titleId: string
  type: 'movie' | 'tv' | 'anime'
  name: string
  year: string | null
  posterPath: string | null
  matchedAlias: string | null
}
