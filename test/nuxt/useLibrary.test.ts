import { beforeEach, describe, expect, it } from 'vitest'
import { useLibrary } from '~/composables/useLibrary'
import type { LibraryData } from '~/utils/library/types'
import { recentlyWatched } from '~/utils/library/derive'

describe('useLibrary', () => {
  beforeEach(() => {
    clearNuxtState(['library', 'library-today'])
  })

  it('marking the up-next episode lowers its new count and tops recently watched', () => {
    const library = useLibrary()
    const hero = library.upNext.value!
    const episode = hero.nextEpisode!

    library.markWatched(hero.title.id, episode.id)

    const after = library.summaries.value.find(summary => summary.title.id === hero.title.id)!
    expect(after.newCount).toBe(hero.newCount - 1)
    expect(recentlyWatched(library.data.value)[0]).toMatchObject({ title: { id: hero.title.id }, episode: { id: episode.id } })
  })

  it('moves the hero on once every aired episode of the current hero is watched', () => {
    const library = useLibrary()
    const firstHeroId = library.upNext.value!.title.id

    while (library.upNext.value?.title.id === firstHeroId) {
      library.markWatched(firstHeroId, library.upNext.value.nextEpisode!.id)
    }

    expect(library.upNext.value?.title.id).not.toBe(firstHeroId)
    expect(library.summaries.value.find(summary => summary.title.id === firstHeroId)!.newCount).toBe(0)
  })

  it('takes today from shared state so server and browser agree on the date', () => {
    useState('library-today', () => '2026-03-02')
    const library = useLibrary()

    expect(library.week.value.find(day => day.isToday)?.date).toBe('2026-03-02')
  })

  function seedLibrary(watches: LibraryData['watches'] = []) {
    const episodes = [1, 2, 3, 4].map(number => ({
      id: `s-1-${number}`,
      titleId: 's',
      season: 1,
      number,
      airDate: number <= 3 ? '2026-01-01' : '2999-01-01'
    }))
    const data = useState<LibraryData>('library')
    data.value = {
      titles: [{ id: 's', type: 'tv', name: 's', firstAired: '2026-01-01', posterPath: '/p.jpg' }],
      episodes,
      watches
    }
    return useLibrary()
  }

  it('markSeason marks only aired unwatched episodes and is idempotent', () => {
    const library = seedLibrary([{ titleId: 's', episodeId: 's-1-1', watchedAt: '2026-02-01T10:00:00' }])

    expect(library.markSeason('s', 1)).toHaveLength(2)
    expect(library.data.value.watches).toHaveLength(3)
    expect(library.markSeason('s', 1)).toHaveLength(0)
    expect(library.data.value.watches).toHaveLength(3)
  })

  it('markThrough never marks an upcoming episode', () => {
    const library = seedLibrary()

    expect(library.markThrough('s', 's-1-4')).toHaveLength(3)
    expect(library.data.value.watches.some(watch => watch.episodeId === 's-1-4')).toBe(false)
  })

  it('unmarking the only watched episode leaves the title planned', () => {
    const library = seedLibrary([{ titleId: 's', episodeId: 's-1-1', watchedAt: '2026-02-01T10:00:00' }])

    const removed = library.unmarkEpisode('s-1-1')

    expect(removed).toHaveLength(1)
    expect(library.summaries.value[0]!.status).toBe('planned')
  })

  it('discardWatches undoes markSeason', () => {
    const library = seedLibrary([{ titleId: 's', episodeId: 's-1-1', watchedAt: '2026-02-01T10:00:00' }])
    const before = library.data.value.watches.map(watch => ({ ...watch }))

    library.discardWatches(library.markSeason('s', 1))

    expect(library.data.value.watches).toEqual(before)
  })

  it('restoreWatches undoes unmarkEpisode', () => {
    const library = seedLibrary([{ titleId: 's', episodeId: 's-1-1', watchedAt: '2026-02-01T10:00:00' }])
    const before = library.data.value.watches.map(watch => ({ ...watch }))

    library.restoreWatches(library.unmarkEpisode('s-1-1'))

    expect(library.data.value.watches).toEqual(before)
  })

  it('removeWatch returns the removed movie watches so restoreWatches can undo it', () => {
    const library = seedLibrary([{ titleId: 'm', watchedAt: '2026-02-01T10:00:00' }, { titleId: 'm', watchedAt: '2026-03-01T10:00:00' }])
    const before = library.data.value.watches.map(watch => ({ ...watch }))

    const removed = library.removeWatch('m', '2026-02-01T10:00:00')

    expect(removed).toEqual([{ titleId: 'm', watchedAt: '2026-02-01T10:00:00' }])
    expect(library.data.value.watches).toHaveLength(1)
    library.restoreWatches(removed)
    expect(library.data.value.watches).toHaveLength(before.length)
  })

  it('markThrough on a special returns an empty array', () => {
    const library = seedLibrary()
    library.data.value = {
      ...library.data.value,
      episodes: [...library.data.value.episodes, { id: 's-0-1', titleId: 's', season: 0, number: 1, airDate: '2026-01-01' }]
    }

    expect(library.markThrough('s', 's-0-1')).toEqual([])
    expect(library.data.value.watches).toHaveLength(0)
  })

  it('markThrough on an unknown episode returns an empty array', () => {
    const library = seedLibrary()

    expect(library.markThrough('s', 'missing')).toEqual([])
  })
})
