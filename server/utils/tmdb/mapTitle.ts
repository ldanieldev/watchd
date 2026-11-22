import type { CreditPerson, EpisodeDetail, SeasonDetail, TitleCollection, TitleExtra } from '../../../shared/types/library'

interface RawNamed {
  name: string
}

interface RawGenre extends RawNamed {
  id: number
}

export interface RawPerson {
  id: number
  name: string
  profile_path: string | null
}

interface RawCastMember extends RawPerson {
  order: number
  character?: string
  roles?: { character: string }[]
}

interface RawCrewMember extends RawPerson {
  job?: string
  jobs?: { job: string }[]
}

interface RawCredits {
  cast: RawCastMember[]
  crew: RawCrewMember[]
}

interface RawTitleBase {
  overview: string
  genres: RawGenre[]
  origin_country: string[]
  status: string
  production_companies: RawNamed[]
  spoken_languages: { english_name: string }[]
  vote_average: number
  vote_count: number
  poster_path: string | null
  backdrop_path: string | null
}

export interface RawTv extends RawTitleBase {
  name: string
  original_name?: string
  alternative_titles?: { results: { title: string }[] }
  first_air_date: string
  networks: RawNamed[]
  created_by: RawPerson[]
  seasons: { season_number: number, name: string, poster_path: string | null, overview: string }[]
  episode_run_time: number[]
  last_episode_to_air: { runtime: number | null } | null
  aggregate_credits: RawCredits
  content_ratings: { results: { iso_3166_1: string, rating: string }[] }
}

export interface RawMovie extends RawTitleBase {
  title: string
  original_title?: string
  alternative_titles?: { titles: { title: string }[] }
  release_date: string
  runtime: number | null
  belongs_to_collection: { id: number } | null
  credits: RawCredits
  release_dates: { results: { iso_3166_1: string, release_dates: { certification: string, type: number }[] }[] }
}

export interface RawSeason {
  season_number: number
  name: string
  poster_path: string | null
  overview: string
  episodes: {
    id: number
    episode_number: number
    name: string
    overview: string
    still_path: string | null
    runtime: number | null
    air_date: string | null
  }[]
}

export interface MappedTitle {
  name: string
  originalName?: string
  alternativeNames: string[]
  firstAired?: string
  posterPath?: string
  backdropPath?: string
  runtimeMinutes?: number
  isAnime: boolean
  genres: string[]
  studios: string[]
  network?: string
  cast: CreditPerson[]
  crew: CreditPerson[]
  detail: TitleExtra
  tmdbStatus: string
  episodes: (EpisodeDetail & { tmdbEpisodeId: number })[]
}

const ANIMATION_GENRE_ID = 16
const CAST_PER_TITLE = 10
const CREW_PER_TITLE = 3
const CREW_JOB_PRIORITY = ['Creator', 'Director', 'Writer', 'Screenplay']

export function isAnimeSeries(genreIds: number[], originCountries: string[]): boolean {
  return genreIds.includes(ANIMATION_GENRE_ID) && originCountries.includes('JP')
}

function optional<T>(value: T | null | undefined | ''): T | undefined {
  return value === null || value === undefined || value === '' ? undefined : value
}

function jobRank(job: string): number {
  const index = CREW_JOB_PRIORITY.indexOf(job)
  return index === -1 ? CREW_JOB_PRIORITY.length : index
}

function pickCrew(candidates: CreditPerson[]): CreditPerson[] {
  const ranked = candidates
    .map((person, position) => ({ person, position }))
    .sort((left, right) => jobRank(left.person.role) - jobRank(right.person.role) || left.position - right.position)
  const seen = new Set<number>()
  const picked: CreditPerson[] = []
  for (const { person } of ranked) {
    if (seen.has(person.personId)) continue
    seen.add(person.personId)
    picked.push(person)
    if (picked.length === CREW_PER_TITLE) break
  }
  return picked
}

function toCreditPerson(raw: RawPerson, role: string): CreditPerson {
  const person: CreditPerson = { personId: raw.id, name: raw.name, role }
  const profilePath = optional(raw.profile_path)
  if (profilePath) person.profilePath = profilePath
  return person
}

function topCast(cast: RawCastMember[], roleOf: (person: RawCastMember) => string): CreditPerson[] {
  return [...cast].sort((left, right) => left.order - right.order).slice(0, CAST_PER_TITLE).map(person => toCreditPerson(person, roleOf(person)))
}

function baseFields(raw: RawTitleBase) {
  return {
    posterPath: optional(raw.poster_path),
    backdropPath: optional(raw.backdrop_path),
    genres: raw.genres.map(genre => genre.name),
    studios: raw.production_companies.map(company => company.name),
    tmdbStatus: raw.status
  }
}

function baseExtra(raw: RawTitleBase): Omit<TitleExtra, 'seasons' | 'certification' | 'collection'> {
  return {
    overview: raw.overview,
    status: raw.status,
    languages: raw.spoken_languages.map(language => language.english_name),
    voteAverage: optional(raw.vote_average),
    voteCount: optional(raw.vote_count)
  }
}

function mapNames(name: string, originalName: string | undefined, alternatives: { title: string }[] | undefined) {
  const distinctOriginal = originalName && originalName !== name ? originalName : undefined
  const alternativeNames = [...new Set((alternatives ?? []).map(alternative => alternative.title))]
    .filter(title => title && title !== name && title !== distinctOriginal)
  return { name, originalName: distinctOriginal, alternativeNames }
}

function toSeasonDetail(season: { season_number: number, name: string, poster_path: string | null, overview: string }): SeasonDetail {
  return { season: season.season_number, name: season.name, posterPath: optional(season.poster_path), overview: optional(season.overview) }
}

export function mapTv(raw: RawTv, seasons: RawSeason[]): MappedTitle {
  const crewJobs = raw.aggregate_credits.crew.flatMap(person => (person.jobs ?? []).map(job => toCreditPerson(person, job.job)))
  return {
    ...baseFields(raw),
    ...mapNames(raw.name, raw.original_name, raw.alternative_titles?.results),
    firstAired: optional(raw.first_air_date),
    runtimeMinutes: optional(raw.episode_run_time[0] ?? raw.last_episode_to_air?.runtime),
    isAnime: isAnimeSeries(raw.genres.map(genre => genre.id), raw.origin_country),
    network: optional(raw.networks[0]?.name),
    cast: topCast(raw.aggregate_credits.cast, person => person.roles?.[0]?.character ?? ''),
    crew: pickCrew([...raw.created_by.map(person => toCreditPerson(person, 'Creator')), ...crewJobs]),
    detail: {
      ...baseExtra(raw),
      certification: optional(raw.content_ratings.results.find(country => country.iso_3166_1 === 'US')?.rating),
      seasons: raw.seasons.map(toSeasonDetail).sort((left, right) => left.season - right.season)
    },
    episodes: seasons.flatMap(season => season.episodes.map(episode => ({
      season: season.season_number,
      number: episode.episode_number,
      tmdbEpisodeId: episode.id,
      name: episode.name,
      airDate: optional(episode.air_date),
      overview: optional(episode.overview),
      stillPath: optional(episode.still_path),
      runtimeMinutes: optional(episode.runtime)
    })))
  }
}

function movieCertification(releaseDates: RawMovie['release_dates']): string | undefined {
  const unitedStates = releaseDates.results.find(country => country.iso_3166_1 === 'US')
  const certified = (unitedStates?.release_dates ?? []).filter(release => release.certification)
  const theatrical = certified.find(release => release.type === 3) ?? certified[0]
  return optional(theatrical?.certification)
}

export function mapMovie(raw: RawMovie, collection?: TitleCollection): MappedTitle {
  return {
    ...baseFields(raw),
    ...mapNames(raw.title, raw.original_title, raw.alternative_titles?.titles),
    firstAired: optional(raw.release_date),
    runtimeMinutes: optional(raw.runtime),
    isAnime: false,
    cast: topCast(raw.credits.cast, person => person.character ?? ''),
    crew: pickCrew(raw.credits.crew.map(person => toCreditPerson(person, person.job ?? ''))),
    detail: { ...baseExtra(raw), certification: movieCertification(raw.release_dates), seasons: [], collection },
    episodes: []
  }
}
