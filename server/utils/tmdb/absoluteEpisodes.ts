export interface EpisodeKey {
  season: number
  number: number
}

export interface EpisodeRemap {
  from: EpisodeKey
  to: EpisodeKey
}

/**
 * TMDB numbers some long-running shows (One Piece) absolutely across seasons, while trackers like Floppy number each
 * season from 1. For each play with no matching TMDB episode, this finds the episode at the same position counted
 * from the start of its TMDB season, in whichever season TMDB files that absolute number under.
 */
export function absoluteEpisodeRemaps(tmdbEpisodes: EpisodeKey[], plays: EpisodeKey[]): EpisodeRemap[] {
  const known = new Set(tmdbEpisodes.map(episode => `${episode.season}-${episode.number}`))
  const seasonStart = new Map<number, number>()
  for (const episode of tmdbEpisodes) {
    if (episode.season === 0) continue
    seasonStart.set(episode.season, Math.min(seasonStart.get(episode.season) ?? episode.number, episode.number))
  }
  const seasonOfAbsolute = new Map(tmdbEpisodes.filter(episode => episode.season !== 0).map(episode => [episode.number, episode.season]))

  return plays.flatMap((play) => {
    const start = seasonStart.get(play.season)
    if (known.has(`${play.season}-${play.number}`) || start === undefined || start === 1) return []
    const absolute = play.number + start - 1
    const season = seasonOfAbsolute.get(absolute)
    return season === undefined ? [] : [{ from: play, to: { season, number: absolute } }]
  })
}
