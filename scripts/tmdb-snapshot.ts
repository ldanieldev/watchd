import { readFile, writeFile } from 'node:fs/promises'
import {
  detailsSnapshotSchema,
  type CreditPerson,
  type DetailsSnapshot,
  type EpisodeDetail,
  type FilmographyCredit,
  type PersonDetail,
  type SeasonDetail,
  type TitleDetail
} from '../app/utils/library/details'
import { catalog } from '../app/utils/library/catalog'

type MediaKind = 'movie' | 'tv'

interface FeaturedTitle {
  titleId: string
  kind: MediaKind
  tmdbId: number
}

const featuredTitles: FeaturedTitle[] = catalog.map((entry) => {
  if (entry.tmdbId === undefined) throw new Error(`catalog entry ${entry.id} has no tmdbId`)
  return { titleId: entry.id, kind: entry.type === 'movie' ? 'movie' : 'tv', tmdbId: entry.tmdbId }
})

interface RawNamed {
  name: string
}

interface RawPerson {
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

interface RawCountryRelease {
  iso_3166_1: string
  release_dates: { certification: string, type: number }[]
}

interface RawCountryRating {
  iso_3166_1: string
  rating: string
}

interface RawTitleBase {
  overview: string
  genres: RawNamed[]
  status: string
  production_companies: RawNamed[]
  spoken_languages: { english_name: string }[]
  vote_average: number
  vote_count: number
}

interface RawTv extends RawTitleBase {
  networks: RawNamed[]
  created_by: RawPerson[]
  seasons: { season_number: number, name: string, poster_path: string | null, overview: string }[]
  number_of_episodes: number
  episode_run_time: number[]
  last_episode_to_air: { runtime: number | null } | null
  aggregate_credits: RawCredits
  content_ratings: { results: RawCountryRating[] }
}

interface RawMovie extends RawTitleBase {
  title: string
  release_date: string
  runtime: number | null
  poster_path: string | null
  backdrop_path: string | null
  belongs_to_collection: { id: number } | null
  credits: RawCredits
  release_dates: { results: RawCountryRelease[] }
}

interface RawSeason {
  name: string
  poster_path: string | null
  overview: string
  episodes: {
    episode_number: number
    name: string
    overview: string
    still_path: string | null
    runtime: number | null
  }[]
}

interface RawFilmographyItem {
  id: number
  media_type: string
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path: string | null
  genre_ids?: number[]
  character?: string
  job?: string
}

interface RawPersonDetail {
  name: string
  profile_path: string | null
  biography: string
  birthday: string | null
  place_of_birth: string | null
  known_for_department: string
  combined_credits: { cast: RawFilmographyItem[], crew: RawFilmographyItem[] }
}

const newCollectionMovieIds = ['knives-out', 'dune', 'dune-part-three']
const outputPath = new URL('../app/utils/library/details.json', import.meta.url)
const environmentPath = new URL('../.env', import.meta.url)
const castPerTitle = 5
const crewPerTitle = 3
const maxEpisodesWithDetails = 100
const creditsPerPerson = 40
const crewJobPriority = ['Creator', 'Director', 'Writer', 'Screenplay']
const catalogCreditKeys = new Set(
  catalog.flatMap(entry => entry.tmdbId === undefined ? [] : [`${entry.type === 'movie' ? 'movie' : 'tv'}-${entry.tmdbId}`])
)
const excludedGenreIds = new Set([99, 10763, 10767])

async function readApiKey(): Promise<string> {
  const environmentFile = await readFile(environmentPath, 'utf8')
  const match = environmentFile.match(/^TMDB_API_KEY=(.*)$/m)
  const apiKey = match?.[1]?.trim().replace(/^["']|["']$/g, '')
  if (!apiKey) throw new Error('TMDB_API_KEY is missing from .env')
  return apiKey
}

const apiKey = await readApiKey()

async function tmdbGet<Response>(path: string, query: Record<string, string> = {}, attempt = 0): Promise<Response> {
  const parameters = new URLSearchParams({ api_key: apiKey, language: 'en-US', ...query })
  const response = await fetch(`https://api.themoviedb.org/3${path}?${parameters}`)
  if (response.status === 429 && attempt < 5) {
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
    return tmdbGet<Response>(path, query, attempt + 1)
  }
  if (!response.ok) throw new Error(`TMDB ${response.status} for ${path}`)
  return await response.json() as Response
}

function optional<T>(value: T | null | undefined | ''): T | undefined {
  return value === null || value === undefined || value === '' ? undefined : value
}

function yearOf(date: string | undefined): number | undefined {
  const year = date ? Number(date.slice(0, 4)) : Number.NaN
  return Number.isNaN(year) ? undefined : year
}

function movieCertification(releaseDates: RawMovie['release_dates']): string | undefined {
  const unitedStates = releaseDates.results.find(country => country.iso_3166_1 === 'US')
  const certified = (unitedStates?.release_dates ?? []).filter(release => release.certification)
  const theatrical = certified.find(release => release.type === 3) ?? certified[0]
  return optional(theatrical?.certification)
}

function tvCertification(contentRatings: RawTv['content_ratings']): string | undefined {
  return optional(contentRatings.results.find(country => country.iso_3166_1 === 'US')?.rating)
}

function jobRank(job: string): number {
  const index = crewJobPriority.indexOf(job)
  return index === -1 ? crewJobPriority.length : index
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
    if (picked.length === crewPerTitle) break
  }
  return picked
}

function toCreditPerson(raw: RawPerson, role: string): CreditPerson {
  return { personId: raw.id, name: raw.name, role, profilePath: optional(raw.profile_path) }
}

function movieCredits(credits: RawCredits): Pick<TitleDetail, 'cast' | 'crew'> {
  const cast = [...credits.cast]
    .sort((left, right) => left.order - right.order)
    .slice(0, castPerTitle)
    .map(person => toCreditPerson(person, person.character ?? ''))
  const crew = pickCrew(credits.crew.map(person => toCreditPerson(person, person.job ?? '')))
  return { cast, crew }
}

function tvCredits(createdBy: RawPerson[], aggregateCredits: RawCredits): Pick<TitleDetail, 'cast' | 'crew'> {
  const cast = [...aggregateCredits.cast]
    .sort((left, right) => left.order - right.order)
    .slice(0, castPerTitle)
    .map(person => toCreditPerson(person, person.roles?.[0]?.character ?? ''))
  const creators = createdBy.map(person => toCreditPerson(person, 'Creator'))
  const crewJobs = aggregateCredits.crew.flatMap(person =>
    (person.jobs ?? []).map(job => toCreditPerson(person, job.job))
  )
  return { cast, crew: pickCrew([...creators, ...crewJobs]) }
}

async function fetchSeasons(tvTmdbId: number, seasonNumbers: number[]) {
  const seasons: SeasonDetail[] = []
  const episodes: EpisodeDetail[] = []
  for (const seasonNumber of [...seasonNumbers].sort((left, right) => left - right)) {
    const raw = await tmdbGet<RawSeason>(`/tv/${tvTmdbId}/season/${seasonNumber}`)
    seasons.push({
      season: seasonNumber,
      name: raw.name,
      posterPath: optional(raw.poster_path),
      overview: optional(raw.overview)
    })
    for (const episode of raw.episodes) {
      episodes.push({
        season: seasonNumber,
        number: episode.episode_number,
        name: episode.name,
        overview: optional(episode.overview),
        stillPath: optional(episode.still_path),
        runtimeMinutes: optional(episode.runtime)
      })
    }
  }
  return { seasons, episodes }
}

async function fetchTvTitle(featured: FeaturedTitle): Promise<TitleDetail> {
  const raw = await tmdbGet<RawTv>(`/tv/${featured.tmdbId}`, { append_to_response: 'aggregate_credits,content_ratings' })
  const { seasons, episodes } = raw.number_of_episodes > maxEpisodesWithDetails
    ? { seasons: raw.seasons.map(season => ({ season: season.season_number, name: season.name, posterPath: optional(season.poster_path), overview: optional(season.overview) })), episodes: [] }
    : await fetchSeasons(featured.tmdbId, raw.seasons.map(season => season.season_number))
  return {
    titleId: featured.titleId,
    tmdbId: featured.tmdbId,
    overview: raw.overview,
    genres: raw.genres.map(genre => genre.name),
    status: raw.status,
    network: optional(raw.networks[0]?.name),
    studios: raw.production_companies.map(company => company.name),
    certification: tvCertification(raw.content_ratings),
    languages: raw.spoken_languages.map(language => language.english_name),
    voteAverage: optional(raw.vote_average),
    voteCount: optional(raw.vote_count),
    ...tvCredits(raw.created_by, raw.aggregate_credits),
    runtimeMinutes: optional(raw.episode_run_time[0] ?? raw.last_episode_to_air?.runtime),
    seasons,
    episodes
  }
}

async function fetchMovieTitle(featured: FeaturedTitle): Promise<{ detail: TitleDetail, raw: RawMovie }> {
  const raw = await tmdbGet<RawMovie>(`/movie/${featured.tmdbId}`, { append_to_response: 'credits,release_dates' })
  const collectionStub = raw.belongs_to_collection
  const collectionRaw = collectionStub ? await tmdbGet<{ name: string, parts: { id: number }[] }>(`/collection/${collectionStub.id}`) : undefined
  const detail: TitleDetail = {
    titleId: featured.titleId,
    tmdbId: featured.tmdbId,
    overview: raw.overview,
    genres: raw.genres.map(genre => genre.name),
    status: raw.status,
    studios: raw.production_companies.map(company => company.name),
    certification: movieCertification(raw.release_dates),
    languages: raw.spoken_languages.map(language => language.english_name),
    voteAverage: optional(raw.vote_average),
    voteCount: optional(raw.vote_count),
    ...movieCredits(raw.credits),
    runtimeMinutes: optional(raw.runtime),
    seasons: [],
    episodes: [],
    collection: collectionRaw
      ? { name: collectionRaw.name, memberTmdbIds: collectionRaw.parts.map(part => part.id).sort((left, right) => left - right) }
      : undefined
  }
  return { detail, raw }
}

function toFilmographyCredit(raw: RawFilmographyItem, role: string | undefined): FilmographyCredit | undefined {
  if (raw.media_type !== 'movie' && raw.media_type !== 'tv') return undefined
  if (!raw.poster_path || !role) return undefined
  if ((raw.genre_ids ?? []).some(genreId => excludedGenreIds.has(genreId))) return undefined
  if (/^self\b/i.test(role)) return undefined
  const isMovie = raw.media_type === 'movie'
  return {
    tmdbId: raw.id,
    mediaType: raw.media_type,
    name: (isMovie ? raw.title : raw.name) ?? '',
    year: yearOf(isMovie ? raw.release_date : raw.first_air_date),
    posterPath: raw.poster_path,
    role
  }
}

function compareCredits(left: FilmographyCredit, right: FilmographyCredit): number {
  return (right.year ?? 0) - (left.year ?? 0) || left.tmdbId - right.tmdbId || left.mediaType.localeCompare(right.mediaType)
}

async function fetchPerson(personId: number): Promise<PersonDetail> {
  const raw = await tmdbGet<RawPersonDetail>(`/person/${personId}`, { append_to_response: 'combined_credits' })
  const byKey = new Map<string, FilmographyCredit>()
  const rawCredits = [
    ...raw.combined_credits.cast.map(credit => ({ credit, role: credit.character })),
    ...raw.combined_credits.crew.map(credit => ({ credit, role: credit.job }))
  ]
  for (const { credit, role } of rawCredits) {
    const mapped = toFilmographyCredit(credit, role)
    if (mapped && !byKey.has(`${mapped.mediaType}-${mapped.tmdbId}`)) byKey.set(`${mapped.mediaType}-${mapped.tmdbId}`, mapped)
  }
  const sortedCredits = [...byKey.values()].sort(compareCredits)
  const isCatalogCredit = (credit: FilmographyCredit) => catalogCreditKeys.has(`${credit.mediaType}-${credit.tmdbId}`)
  const catalogCredits = sortedCredits.filter(isCatalogCredit)
  const otherCredits = sortedCredits.filter(credit => !isCatalogCredit(credit))
  return {
    personId,
    name: raw.name,
    profilePath: optional(raw.profile_path),
    biography: raw.biography ?? '',
    birthday: optional(raw.birthday),
    placeOfBirth: optional(raw.place_of_birth),
    knownFor: raw.known_for_department ?? '',
    credits: [...catalogCredits, ...otherCredits.slice(0, Math.max(0, creditsPerPerson - catalogCredits.length))].sort(compareCredits)
  }
}

const titles: TitleDetail[] = []
const newMovieReports: string[] = []

for (const featured of featuredTitles) {
  if (featured.kind === 'tv') {
    titles.push(await fetchTvTitle(featured))
    continue
  }
  const { detail, raw } = await fetchMovieTitle(featured)
  titles.push(detail)
  if (newCollectionMovieIds.includes(featured.titleId)) {
    newMovieReports.push(JSON.stringify({
      id: featured.titleId,
      name: raw.title,
      tmdbId: featured.tmdbId,
      posterPath: raw.poster_path,
      backdropPath: raw.backdrop_path,
      releaseDate: raw.release_date,
      runtimeMinutes: raw.runtime
    }))
  }
}

const personIds = [...new Set(titles.flatMap(title => [...title.cast, ...title.crew].map(person => person.personId)))].sort((left, right) => left - right)
const people: PersonDetail[] = []
for (const personId of personIds) people.push(await fetchPerson(personId))

const snapshot: DetailsSnapshot = detailsSnapshotSchema.parse({ titles, people })
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`)

console.log(`wrote ${snapshot.titles.length} titles and ${snapshot.people.length} people`)
for (const report of newMovieReports) console.log(report)
