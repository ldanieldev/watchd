import { beforeEach, describe, expect, it } from 'vitest'
import { useLibrary } from '~/composables/useLibrary'
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
})
