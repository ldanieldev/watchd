export type TmdbImageSize = 'w92' | 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'h632'

export function tmdbImage(path: string, size: TmdbImageSize): string {
  return `https://image.tmdb.org/t/p/${size}${path}`
}

export function tmdbPageUrl(mediaType: 'movie' | 'tv', tmdbId: number): string {
  return `https://www.themoviedb.org/${mediaType}/${tmdbId}`
}
