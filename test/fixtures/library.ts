import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, getQuery, type H3Event } from 'h3'
import { ref } from 'vue'
import { clearNuxtData, clearNuxtState } from '#imports'
import { createLibraryStore } from '~/composables/useLibrary'
import type { DetailsSnapshot, PersonDetail, PersonPage, TitleDetail } from '~~/shared/types/library'
import type { Episode, LibraryData, MediaType, Title, TypeFilter } from '~~/shared/utils/library/types'
import type { StatsRange } from '~~/shared/utils/library/stats'
import { parseIsoDate } from '~~/shared/utils/library/dates'
import { historyView, homeView, inViewerZone, personLibraryTitles, releasesView, statsView, summariesView, titleSlice } from '~~/shared/utils/library/views'
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

const HAS_OFFSET = /(Z|[+-]\d{2}:\d{2})$/

function asStoredLibrary(library: LibraryData): LibraryData {
  return {
    ...library,
    watches: library.watches.map(watch => (HAS_OFFSET.test(watch.watchedAt) ? watch : { ...watch, watchedAt: new Date(watch.watchedAt).toISOString() }))
  }
}

let storedLibrary: LibraryData = { titles: [], episodes: [], watches: [] }

function viewArgs(event: H3Event) {
  const query = getQuery(event) as Record<string, string>
  return { query, library: inViewerZone(storedLibrary, query.tz!), today: parseIsoDate(query.today!) }
}

let viewEndpointsRegistered = false
const registeredTitleIds = new Set<string>()

// Stands in for server/api/library/views/* using the same shared builders, over whichever library the test last set.
function registerFixtureEndpoints() {
  for (const title of storedLibrary.titles) {
    if (registeredTitleIds.has(title.id)) continue
    registeredTitleIds.add(title.id)
    registerEndpoint(`/api/library/views/title/${title.id}`, () => {
      const slice = titleSlice(storedLibrary, title.id, snapshotDetail(title.id)?.collection?.memberTmdbIds ?? [])
      if (!slice) throw createError({ statusCode: 404, statusMessage: 'Title not found' })
      return slice
    })
  }
  if (viewEndpointsRegistered) return
  viewEndpointsRegistered = true
  for (const detail of snapshot.titles) registerEndpoint(`/api/library/titles/${detail.titleId}`, () => detail)
  for (const person of snapshot.people) {
    registerEndpoint(`/api/people/${person.personId}`, (): PersonPage => ({ ...person, libraryTitles: personLibraryTitles(storedLibrary, person) }))
  }
  registerEndpoint('/api/library/watches', { method: 'POST', handler: () => ({ added: 1 }) })
  registerEndpoint('/api/library/watches/delete', { method: 'POST', handler: () => ({ removed: 1 }) })
  registerEndpoint('/api/library/views/home', (event) => {
    const { library, today } = viewArgs(event)
    return homeView(library, today)
  })
  registerEndpoint('/api/library/views/summaries', (event) => {
    const { library, today, query } = viewArgs(event)
    return summariesView(library, query.type as MediaType, today)
  })
  registerEndpoint('/api/library/views/releases', (event) => {
    const { library, query } = viewArgs(event)
    return releasesView(library, query.from!, query.to!)
  })
  registerEndpoint('/api/library/views/history', (event) => {
    const { library, today, query } = viewArgs(event)
    return historyView(library, query.month ?? 'latest', (query.type ?? 'all') as TypeFilter, today)
  })
  registerEndpoint('/api/library/views/stats', (event) => {
    const { library, today, query } = viewArgs(event)
    return statsView(library, (query.range ?? '12m') as StatsRange, (query.type ?? 'all') as TypeFilter, today)
  })
}

export function fixtureStore(library?: LibraryData) {
  useFixtureLibrary(library)
  return createLibraryStore(ref(structuredClone(storedLibrary)))
}

export function useFixtureLibrary(library?: LibraryData) {
  clearNuxtState(['library-today', 'library-time-zone'])
  clearNuxtData()
  storedLibrary = asStoredLibrary(library ?? fixtureLibrary())
  registerFixtureEndpoints()
}
