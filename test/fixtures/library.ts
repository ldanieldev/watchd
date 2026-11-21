import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { clearNuxtState, useState } from '#imports'
import type { DetailsSnapshot, PersonDetail, TitleDetail } from '~~/shared/types/library'
import type { Episode, LibraryData, Title } from '~/utils/library/types'
import { buildFixtures } from './buildFixtures'
import snapshotJson from './details.json'

export const snapshot = snapshotJson as DetailsSnapshot
const titlesById = new Map(snapshot.titles.map(detail => [detail.titleId, detail]))
const peopleById = new Map(snapshot.people.map(person => [person.personId, person]))

export function snapshotDetail(titleId: string): TitleDetail | undefined {
  return titlesById.get(titleId)
}

export function snapshotPerson(personId: number): PersonDetail | undefined {
  return peopleById.get(personId)
}

export function withSnapshotDetails(title: Title): Title {
  const detail = titlesById.get(title.id)
  if (!detail) return title
  return {
    ...title,
    runtimeMinutes: title.runtimeMinutes ?? detail.runtimeMinutes,
    genres: detail.genres,
    studios: detail.studios,
    network: detail.network,
    cast: detail.cast,
    crew: detail.crew
  }
}

export function withSnapshotEpisode(episode: Episode): Episode {
  const detail = titlesById.get(episode.titleId)?.episodes.find(candidate => candidate.season === episode.season && candidate.number === episode.number)
  if (!detail) return episode
  return { ...episode, name: detail.name, runtimeMinutes: detail.runtimeMinutes }
}

export function fixtureLibrary(today = new Date()): LibraryData {
  const fixtures = buildFixtures(today)
  return { titles: fixtures.titles.map(withSnapshotDetails), episodes: fixtures.episodes.map(withSnapshotEpisode), watches: fixtures.watches }
}

let endpointsRegistered = false

function registerFixtureEndpoints() {
  if (endpointsRegistered) return
  endpointsRegistered = true
  for (const detail of snapshot.titles) registerEndpoint(`/api/library/titles/${detail.titleId}`, () => detail)
  for (const person of snapshot.people) registerEndpoint(`/api/people/${person.personId}`, () => person)
  registerEndpoint('/api/library/watches', { method: 'POST', handler: () => ({ added: 1 }) })
  registerEndpoint('/api/library/watches/delete', { method: 'POST', handler: () => ({ removed: 1 }) })
}

const HAS_OFFSET = /(Z|[+-]\d{2}:\d{2})$/

function asStoredLibrary(library: LibraryData): LibraryData {
  return {
    ...library,
    watches: library.watches.map(watch => (HAS_OFFSET.test(watch.watchedAt) ? watch : { ...watch, watchedAt: new Date(watch.watchedAt).toISOString() }))
  }
}

export function useFixtureLibrary(library?: LibraryData) {
  clearNuxtState(['library', 'library-today', 'library-time-zone'])
  useState<LibraryData>('library').value = asStoredLibrary(library ?? fixtureLibrary())
  registerFixtureEndpoints()
}
