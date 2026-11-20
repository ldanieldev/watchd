import { describe, expect, it } from 'vitest'
import detailsJson from '~/utils/library/details.json'
import { detailsSnapshotSchema, episodeDetailFor, titleDetailFor } from '~/utils/library/details'
import { catalog } from '~/utils/library/catalog'

describe('library details snapshot', () => {
  it('the snapshot matches its schema', () => {
    expect(() => detailsSnapshotSchema.parse(detailsJson)).not.toThrow()
  })

  it('every snapshot title is a catalog entry with the same tmdbId', () => {
    const snapshot = detailsSnapshotSchema.parse(detailsJson)
    expect(snapshot.titles.length).toBeGreaterThan(0)
    for (const detail of snapshot.titles) {
      const entry = catalog.find(candidate => candidate.id === detail.titleId)
      expect(entry, detail.titleId).toBeDefined()
      expect(entry?.tmdbId, detail.titleId).toBe(detail.tmdbId)
    }
  })

  it('looks up Tulsa King episode names by season and number', () => {
    expect(episodeDetailFor('tulsa-king', 1, 1)?.name).toBeTruthy()
    expect(episodeDetailFor('arcane', 1, 1)).toBeUndefined()
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
    const snapshot = detailsSnapshotSchema.parse(detailsJson)
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
