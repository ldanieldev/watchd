export type MediaType = 'movie' | 'tv' | 'anime'

export type TitleStatus = 'watching' | 'completed' | 'planned' | 'paused' | 'dropped'

export interface Title {
  id: string
  type: MediaType
  name: string
  tmdbId?: number
  firstAired: string
  posterPath: string
  backdropPath?: string
  runtimeMinutes?: number
  heldStatus?: 'paused' | 'dropped'
}

export interface Episode {
  id: string
  titleId: string
  season: number
  number: number
  airDate: string
}

export interface WatchEvent {
  titleId: string
  episodeId?: string
  watchedAt: string
  minutesWatched?: number
}

export interface LibraryData {
  titles: Title[]
  episodes: Episode[]
  watches: WatchEvent[]
}

export interface TitleSummary {
  title: Title
  status: TitleStatus
  watchedCount: number
  airedCount: number
  totalCount: number
  newCount: number
  progress: number
  timesWatched: number
  lastWatchedAt?: string
  nextEpisode?: Episode
  minutesLeft?: number
}

export interface Release {
  title: Title
  episode?: Episode
  date: string
  watched: boolean
}

export interface WeekDay {
  date: string
  isToday: boolean
  isPast: boolean
  releases: Release[]
}

export interface Group<T> {
  label: string
  items: T[]
}

export interface RecentWatch {
  title: Title
  episode?: Episode
  watchedAt: string
}
