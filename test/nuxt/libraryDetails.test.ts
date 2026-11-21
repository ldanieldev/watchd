import { describe, expect, it } from 'vitest'
import { catalog } from '~~/test/fixtures/catalog'
import { snapshot, snapshotDetail as titleDetailFor } from '~~/test/fixtures/library'

const episodeDetailFor = (titleId: string, season: number, number: number) =>
  titleDetailFor(titleId)?.episodes.find(episode => episode.season === season && episode.number === number)

describe('test TMDB snapshot', () => {
  it('has snapshot details for every catalog title', () => {
    expect(catalog.filter(entry => !titleDetailFor(entry.id)).map(entry => entry.id)).toEqual([])
  })

  it('gives TV and anime titles a runtime', () => {
    expect(titleDetailFor('tulsa-king')?.runtimeMinutes).toBeGreaterThan(0)
    expect(titleDetailFor('one-piece')?.runtimeMinutes).toBeGreaterThan(0)
  })

  it('every snapshot title is a catalog entry with the same tmdbId', () => {
    expect(snapshot.titles.length).toBeGreaterThan(0)
    for (const detail of snapshot.titles) {
      const entry = catalog.find(candidate => candidate.id === detail.titleId)
      expect(entry, detail.titleId).toBeDefined()
      expect(entry?.tmdbId, detail.titleId).toBe(detail.tmdbId)
    }
  })

  it('looks up Tulsa King episode names by season and number', () => {
    expect(episodeDetailFor('tulsa-king', 1, 1)?.name).toBeTruthy()
    expect(episodeDetailFor('not-in-snapshot', 1, 1)).toBeUndefined()
  })

  it.each([
    ['glass-onion-a-knives-out-mystery'],
    ['blade-runner-2049']
  ])('%s collection members are all in the catalog', (titleId) => {
    const collection = titleDetailFor(titleId)?.collection
    expect(collection?.memberTmdbIds.length).toBeGreaterThan(0)
    for (const memberTmdbId of collection!.memberTmdbIds) {
      expect(catalog.some(entry => entry.tmdbId === memberTmdbId), String(memberTmdbId)).toBe(true)
    }
  })

  it('every featured title appears in the filmography of each of its cast and crew', () => {
    for (const detail of snapshot.titles) {
      const entry = catalog.find(candidate => candidate.id === detail.titleId)!
      const mediaType = entry.type === 'movie' ? 'movie' : 'tv'
      for (const credited of [...detail.cast, ...detail.crew]) {
        const person = snapshot.people.find(candidate => candidate.personId === credited.personId)
        const hasCredit = person?.credits.some(credit => credit.tmdbId === detail.tmdbId && credit.mediaType === mediaType)
        expect(hasCredit, `${detail.titleId} missing from ${credited.name}`).toBe(true)
      }
    }
  })
})
