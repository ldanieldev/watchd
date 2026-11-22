import { describe, expect, it } from 'vitest'
import { pickCredits } from '~~/server/utils/tmdb/mapPerson'
import { isAnimeSeries, mapMovie, mapTv, type RawMovie, type RawSeason, type RawTv } from '~~/server/utils/tmdb/mapTitle'

const credits = { cast: [], crew: [] }

const rawShow: RawTv = {
  name: 'Frieren', first_air_date: '2023-09-29', poster_path: '/p.jpg', backdrop_path: '/b.jpg', overview: 'Elf mage.',
  genres: [{ id: 16, name: 'Animation' }], origin_country: ['JP'], status: 'Returning Series', production_companies: [{ name: 'Madhouse' }],
  spoken_languages: [{ english_name: 'Japanese' }], vote_average: 8.8, vote_count: 500, networks: [{ name: 'Nippon TV' }],
  created_by: [], seasons: [
    { season_number: 0, name: 'Specials', poster_path: null, overview: '' },
    { season_number: 1, name: 'Season 1', poster_path: '/s1.jpg', overview: 'First.' }
  ],
  episode_run_time: [24], last_episode_to_air: null, aggregate_credits: credits, content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-14' }] }
}

const seasons: RawSeason[] = [
  { season_number: 0, name: 'Specials', poster_path: null, overview: '', episodes: [{ id: 63055, episode_number: 1, name: 'Recap', overview: '', still_path: null, runtime: null, air_date: null }] },
  { season_number: 1, name: 'Season 1', poster_path: '/s1.jpg', overview: 'First.', episodes: [
    { id: 63056, episode_number: 1, name: 'The Journey\'s End', overview: 'It ends.', still_path: '/e1.jpg', runtime: 25, air_date: '2023-09-29' },
    { id: 63057, episode_number: 2, name: 'It Didn\'t Have to Be Magic', overview: '', still_path: null, runtime: 24, air_date: '2023-09-29' }
  ] }
]

const rawMovie: RawMovie = {
  title: 'Your Name.', release_date: '2016-08-26', runtime: 106, poster_path: '/y.jpg', backdrop_path: null, overview: 'Body swap.',
  genres: [{ id: 16, name: 'Animation' }], origin_country: ['JP'], status: 'Released', production_companies: [{ name: 'CoMix Wave Films' }],
  spoken_languages: [{ english_name: 'Japanese' }], vote_average: 8.5, vote_count: 11000, belongs_to_collection: null, credits,
  release_dates: { results: [] }
}

describe('isAnimeSeries', () => {
  it('needs both the Animation genre and Japanese origin', () => {
    expect(isAnimeSeries([16], ['JP'])).toBe(true)
    expect(isAnimeSeries([16], ['US'])).toBe(false)
    expect(isAnimeSeries([18], ['JP'])).toBe(false)
  })
})

describe('mapTv', () => {
  it('keeps every season, specials included, with episode air dates', () => {
    const mapped = mapTv(rawShow, seasons)

    expect(mapped.episodes.map(episode => [episode.season, episode.number, episode.airDate])).toEqual([[0, 1, undefined], [1, 1, '2023-09-29'], [1, 2, '2023-09-29']])
    expect(mapped.detail.seasons.map(season => season.season)).toEqual([0, 1])
  })

  it('keeps each episode\'s TMDB id', () => {
    expect(mapTv(rawShow, seasons).episodes.map(episode => episode.tmdbEpisodeId)).toEqual([63055, 63056, 63057])
  })

  it('flags a Japanese animated series as anime and maps its summary fields', () => {
    expect(mapTv(rawShow, seasons)).toMatchObject({
      name: 'Frieren', firstAired: '2023-09-29', posterPath: '/p.jpg', isAnime: true, genres: ['Animation'], network: 'Nippon TV',
      studios: ['Madhouse'], runtimeMinutes: 24, tmdbStatus: 'Returning Series', detail: { certification: 'TV-14', overview: 'Elf mage.' }
    })
  })
})

describe('title names', () => {
  it('maps original_name and alternative_titles.results for a show', () => {
    const mapped = mapTv({
      ...rawShow,
      name: 'Attack on Titan',
      original_name: '進撃の巨人',
      alternative_titles: { results: [{ title: 'Shingeki no Kyojin' }, { title: 'AOT' }, { title: 'Attack on Titan' }, { title: 'AOT' }] }
    }, [])

    expect(mapped.originalName).toBe('進撃の巨人')
    expect(mapped.alternativeNames).toEqual(['Shingeki no Kyojin', 'AOT'])
  })

  it('maps original_title and alternative_titles.titles for a film', () => {
    const mapped = mapMovie({
      ...rawMovie,
      title: 'Amélie',
      original_title: 'Le Fabuleux Destin d\'Amélie Poulain',
      alternative_titles: { titles: [{ title: 'Amélie Poulain' }] }
    })

    expect(mapped.originalName).toBe('Le Fabuleux Destin d\'Amélie Poulain')
    expect(mapped.alternativeNames).toEqual(['Amélie Poulain'])
  })

  it('gives [] when TMDB returns no alternative titles', () => {
    const mapped = mapTv({ ...rawShow, name: 'Frieren', original_name: 'Frieren' }, [])

    expect(mapped.alternativeNames).toEqual([])
    expect(mapped.originalName).toBeUndefined()
  })
})

describe('mapMovie', () => {
  it('never flags a film as anime', () => {
    expect(mapMovie(rawMovie).isAnime).toBe(false)
  })

  it('maps runtime, release date and status', () => {
    expect(mapMovie(rawMovie)).toMatchObject({ name: 'Your Name.', firstAired: '2016-08-26', runtimeMinutes: 106, tmdbStatus: 'Released', episodes: [] })
  })
})

describe('pickCredits', () => {
  const credit = (tmdbId: number, year: number) => ({ tmdbId, mediaType: 'movie' as const, name: `m${tmdbId}`, year, role: 'Self-less' })
  const credits = Array.from({ length: 60 }, (_, index) => credit(index + 1, 2000 + index))

  it('keeps library credits past the cap and fills the rest newest first', () => {
    const picked = pickCredits(credits, entry => entry.tmdbId === 1)

    expect(picked).toHaveLength(40)
    expect(picked.map(entry => entry.tmdbId)).toContain(1)
    expect(picked[0]!.tmdbId).toBe(60)
  })
})
