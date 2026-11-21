import type { Title } from '../utils/library/types'

export interface CreditPerson {
  personId: number
  name: string
  role: string
  profilePath?: string
}

export interface SeasonDetail {
  season: number
  name: string
  posterPath?: string
  overview?: string
}

export interface EpisodeDetail {
  season: number
  number: number
  name: string
  airDate?: string
  overview?: string
  stillPath?: string
  runtimeMinutes?: number
}

export interface TitleCollection {
  name: string
  memberTmdbIds: number[]
}

export interface TitleExtra {
  overview: string
  status: string
  certification?: string
  languages: string[]
  voteAverage?: number
  voteCount?: number
  seasons: SeasonDetail[]
  collection?: TitleCollection
}

export interface TitleDetail extends TitleExtra {
  titleId: string
  tmdbId: number
  genres: string[]
  network?: string
  studios: string[]
  runtimeMinutes?: number
  cast: CreditPerson[]
  crew: CreditPerson[]
  episodes: EpisodeDetail[]
}

export interface FilmographyCredit {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  name: string
  year?: number
  posterPath?: string
  role: string
}

export interface PersonDetail {
  personId: number
  name: string
  profilePath?: string
  biography: string
  birthday?: string
  placeOfBirth?: string
  knownFor: string
  credits: FilmographyCredit[]
}

export interface PersonPage extends PersonDetail {
  libraryTitles: Title[]
}

export interface DetailsSnapshot {
  titles: TitleDetail[]
  people: PersonDetail[]
}

export interface SkippedRow {
  line: number
  title: string
  reason: string
}

export interface ImportSummary {
  added: number
  duplicates: number
  skipped: SkippedRow[]
  titlesQueued: number
}

export interface EnrichmentStatus {
  total: number
  pending: number
  ready: number
  failed: number
}
