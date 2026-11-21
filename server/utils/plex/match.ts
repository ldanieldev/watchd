import type { PlexItem } from './types'

const TMDB_GUID_PATTERN = /^tmdb:\/\/(\d+)$/
const POSTGRES_INTEGER_MAX = 2_147_483_647

export interface TmdbEpisodeRef {
  season: number
  number: number
  tmdbEpisodeId: number | null
}

export type EpisodeResolution = { season: number, number: number } | { unmatched: 'episode-not-in-tmdb' }

export function tmdbIdFromGuids(guids: string[]): number | undefined {
  for (const guid of guids) {
    const match = guid.match(TMDB_GUID_PATTERN)
    if (match && Number(match[1]) <= POSTGRES_INTEGER_MAX) return Number(match[1])
  }
  return undefined
}

/**
 * TMDB `(season, number)` for a Plex episode: by its own `tmdb://` id first, so Plex's TVDB-style anime seasons never land on the wrong TMDB episode; else by Plex's season and index.
 * A `tmdb://` episode of a title with no TMDB episode ids stored yet stays unmatched until enrichment fills them, since position can't be trusted for it.
 */
export function resolveEpisode(item: Pick<PlexItem, 'guids' | 'parentIndex' | 'index'>, episodesOfTitle: TmdbEpisodeRef[]): EpisodeResolution {
  const tmdbEpisodeId = tmdbIdFromGuids(item.guids)
  if (tmdbEpisodeId !== undefined && !episodesOfTitle.some(episode => episode.tmdbEpisodeId !== null)) return { unmatched: 'episode-not-in-tmdb' }
  const byGuid = tmdbEpisodeId === undefined ? undefined : episodesOfTitle.find(episode => episode.tmdbEpisodeId === tmdbEpisodeId)
  const resolved = byGuid ?? episodesOfTitle.find(episode => episode.season === item.parentIndex && episode.number === item.index)
  return resolved ? { season: resolved.season, number: resolved.number } : { unmatched: 'episode-not-in-tmdb' }
}
