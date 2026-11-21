import type { FilmographyCredit, PersonDetail } from '../../../shared/types/library'

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

export interface RawPersonDetail {
  name: string
  profile_path: string | null
  biography: string | null
  birthday: string | null
  place_of_birth: string | null
  known_for_department: string | null
  combined_credits: { cast: RawFilmographyItem[], crew: RawFilmographyItem[] }
}

const DOCUMENTARY_NEWS_TALK_GENRE_IDS = new Set([99, 10763, 10767])
export const CREDITS_PER_PERSON = 40

function yearOf(date: string | undefined): number | undefined {
  const year = date ? Number(date.slice(0, 4)) : Number.NaN
  return Number.isNaN(year) ? undefined : year
}

function toFilmographyCredit(raw: RawFilmographyItem, role: string | undefined): FilmographyCredit | undefined {
  if (raw.media_type !== 'movie' && raw.media_type !== 'tv') return undefined
  if (!raw.poster_path || !role) return undefined
  if ((raw.genre_ids ?? []).some(genreId => DOCUMENTARY_NEWS_TALK_GENRE_IDS.has(genreId))) return undefined
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

export function mapPerson(personId: number, raw: RawPersonDetail): PersonDetail {
  const byKey = new Map<string, FilmographyCredit>()
  const rawCredits = [
    ...raw.combined_credits.cast.map(credit => ({ credit, role: credit.character })),
    ...raw.combined_credits.crew.map(credit => ({ credit, role: credit.job }))
  ]
  for (const { credit, role } of rawCredits) {
    const mapped = toFilmographyCredit(credit, role)
    if (mapped && !byKey.has(`${mapped.mediaType}-${mapped.tmdbId}`)) byKey.set(`${mapped.mediaType}-${mapped.tmdbId}`, mapped)
  }
  return {
    personId,
    name: raw.name,
    profilePath: raw.profile_path ?? undefined,
    biography: raw.biography ?? '',
    birthday: raw.birthday ?? undefined,
    placeOfBirth: raw.place_of_birth ?? undefined,
    knownFor: raw.known_for_department ?? '',
    credits: [...byKey.values()].sort(compareCredits)
  }
}

export function pickCredits(credits: FilmographyCredit[], isInLibrary: (credit: FilmographyCredit) => boolean): FilmographyCredit[] {
  const library = credits.filter(isInLibrary)
  const others = credits.filter(credit => !isInLibrary(credit)).sort(compareCredits)
  return [...library, ...others.slice(0, Math.max(0, CREDITS_PER_PERSON - library.length))].sort(compareCredits)
}
