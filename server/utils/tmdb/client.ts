const TMDB_API = 'https://api.themoviedb.org/3'
const MAX_RATE_LIMIT_RETRIES = 5

export class TmdbNotFoundError extends Error {}

export async function tmdbGet<Response>(path: string, query: Record<string, string> = {}, attempt = 0): Promise<Response> {
  const { tmdbApiKey } = useRuntimeConfig()
  if (!tmdbApiKey) throw new Error('NUXT_TMDB_API_KEY is not set')
  const parameters = new URLSearchParams({ api_key: tmdbApiKey, language: 'en-US', ...query })
  const response = await fetch(`${TMDB_API}${path}?${parameters}`)
  if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
    return tmdbGet<Response>(path, query, attempt + 1)
  }
  if (response.status === 404) throw new TmdbNotFoundError(`TMDB has no ${path}`)
  if (!response.ok) throw new Error(`TMDB ${response.status} for ${path}`)
  return await response.json() as Response
}
