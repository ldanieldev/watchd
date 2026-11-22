import { describe, expect, it } from 'vitest'
import { toLibraryTitleDocument } from '~~/server/utils/search/libraryTitleDocuments'
import { effectiveTitleType } from '~~/server/utils/library/effectiveTitleType'

const baseRow = {
  id: 12,
  kind: 'tv' as const,
  name: 'Dark',
  originalName: null,
  alternativeNames: null,
  firstAired: '2013-04-07',
  posterPath: '/dark.jpg',
  isAnime: false,
  typeOverride: null
}

describe('toLibraryTitleDocument', () => {
  it('builds the document id and year', () => {
    expect(toLibraryTitleDocument(5, baseRow)).toMatchObject({ id: '5_12', userId: 5, titleId: 12, year: '2013' })
    expect(toLibraryTitleDocument(5, { ...baseRow, firstAired: null }).year).toBeNull()
    expect(toLibraryTitleDocument(5, { ...baseRow, firstAired: '' }).year).toBeNull()
  })

  it('applies the user\'s type override', () => {
    expect(toLibraryTitleDocument(5, { ...baseRow, typeOverride: 'anime' }).category).toBe('anime')
    expect(toLibraryTitleDocument(5, { ...baseRow, kind: 'movie', typeOverride: 'tv' }).category).toBe('movie')
    expect(toLibraryTitleDocument(5, { ...baseRow, isAnime: true }).category).toBe('anime')
  })

  it('null alternativeNames become []', () => {
    expect(toLibraryTitleDocument(5, baseRow).alternativeNames).toEqual([])
  })
})

describe('effectiveTitleType', () => {
  it('lets movies ignore overrides and anime detection', () => {
    expect(effectiveTitleType('movie', true, 'anime')).toBe('movie')
    expect(effectiveTitleType('tv', false, null)).toBe('tv')
  })
})
