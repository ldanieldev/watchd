import { z } from 'zod'
import snapshotJson from './details.json'

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
  overview?: string
  stillPath?: string
  runtimeMinutes?: number
}

export interface TitleDetail {
  titleId: string
  tmdbId: number
  overview: string
  genres: string[]
  status: string
  network?: string
  studios: string[]
  certification?: string
  languages: string[]
  voteAverage?: number
  voteCount?: number
  cast: CreditPerson[]
  crew: CreditPerson[]
  seasons: SeasonDetail[]
  episodes: EpisodeDetail[]
  collection?: { name: string, memberTmdbIds: number[] }
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

export interface DetailsSnapshot {
  titles: TitleDetail[]
  people: PersonDetail[]
}

const creditPersonSchema = z.object({
  personId: z.number(),
  name: z.string(),
  role: z.string(),
  profilePath: z.string().optional()
})

const seasonDetailSchema = z.object({
  season: z.number(),
  name: z.string(),
  posterPath: z.string().optional(),
  overview: z.string().optional()
})

const episodeDetailSchema = z.object({
  season: z.number(),
  number: z.number(),
  name: z.string(),
  overview: z.string().optional(),
  stillPath: z.string().optional(),
  runtimeMinutes: z.number().optional()
})

const titleDetailSchema = z.object({
  titleId: z.string(),
  tmdbId: z.number(),
  overview: z.string(),
  genres: z.array(z.string()),
  status: z.string(),
  network: z.string().optional(),
  studios: z.array(z.string()),
  certification: z.string().optional(),
  languages: z.array(z.string()),
  voteAverage: z.number().optional(),
  voteCount: z.number().optional(),
  cast: z.array(creditPersonSchema),
  crew: z.array(creditPersonSchema),
  seasons: z.array(seasonDetailSchema),
  episodes: z.array(episodeDetailSchema),
  collection: z.object({ name: z.string(), memberTmdbIds: z.array(z.number()) }).optional()
})

const filmographyCreditSchema = z.object({
  tmdbId: z.number(),
  mediaType: z.enum(['movie', 'tv']),
  name: z.string(),
  year: z.number().optional(),
  posterPath: z.string().optional(),
  role: z.string()
})

const personDetailSchema = z.object({
  personId: z.number(),
  name: z.string(),
  profilePath: z.string().optional(),
  biography: z.string(),
  birthday: z.string().optional(),
  placeOfBirth: z.string().optional(),
  knownFor: z.string(),
  credits: z.array(filmographyCreditSchema)
})

export const detailsSnapshotSchema: z.ZodType<DetailsSnapshot> = z.object({
  titles: z.array(titleDetailSchema),
  people: z.array(personDetailSchema)
})

const snapshot = detailsSnapshotSchema.parse(snapshotJson)
const titlesById = new Map(snapshot.titles.map(detail => [detail.titleId, detail]))
const peopleById = new Map(snapshot.people.map(person => [person.personId, person]))

export function titleDetailFor(titleId: string): TitleDetail | undefined {
  return titlesById.get(titleId)
}

export function episodeDetailFor(titleId: string, season: number, number: number): EpisodeDetail | undefined {
  return titlesById.get(titleId)?.episodes.find(episode => episode.season === season && episode.number === number)
}

export function personDetailFor(personId: number): PersonDetail | undefined {
  return peopleById.get(personId)
}
