export type TmdbImageSize = 'w92' | 'w185' | 'w342' | 'w500' | 'w780' | 'w1280'

export function tmdbImage(path: string, size: TmdbImageSize): string {
  return `https://image.tmdb.org/t/p/${size}${path}`
}
