import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import HistoryPage from '~/pages/history.vue'
import type { LibraryData } from '~~/shared/utils/library/types'
import { useFixtureLibrary, withSnapshotDetails, withSnapshotEpisode } from '~~/test/fixtures/library'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))
enableAutoUnmount(afterEach)

const library: LibraryData = {
  titles: [
    withSnapshotDetails({ id: 'tulsa-king', type: 'tv', name: 'Tulsa King', firstAired: '2022-11-13', posterPath: '/p.jpg' }),
    { id: 'dune', type: 'movie', name: 'Dune', firstAired: '2021-09-15', posterPath: '/p.jpg', runtimeMinutes: 155 }
  ],
  episodes: [withSnapshotEpisode({ id: 'tulsa-king-1-1', titleId: 'tulsa-king', season: 1, number: 1, airDate: '2022-11-13' })],
  watches: [
    { titleId: 'tulsa-king', episodeId: 'tulsa-king-1-1', watchedAt: '2026-03-02T21:00:00' },
    { titleId: 'dune', watchedAt: '2026-03-02T19:00:00' }
  ]
}

describe('history page', () => {
  beforeEach(() => {
    useFixtureLibrary(library)
  })

  it('opens on the latest month with watches and totals each day', async () => {
    const wrapper = await mountSuspended(HistoryPage, { route: '/history' })

    expect(wrapper.text()).toContain('March 2026')
    expect(wrapper.find('h3').text()).toBe('Monday, Mar 2, 2026')
    expect(wrapper.text()).toContain('2 items · 3 h 17 min')
  })

  it('captions episodes by name and links them to their season', async () => {
    const wrapper = await mountSuspended(HistoryPage, { route: '/history' })
    const episodeLink = wrapper.find('a[href="/tv/tulsa-king/season/1"]')

    expect(episodeLink.text()).toContain('Go West, Old Man')
    expect(wrapper.find('a[href="/movies/dune"]').exists()).toBe(true)
  })

  it('offers a jump back from an empty month', async () => {
    const wrapper = await mountSuspended(HistoryPage, { route: '/history' })
    await wrapper.find('button[aria-label="Previous month"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Nothing watched in February 2026')
    const jump = wrapper.findAll('button').find(button => button.text() === 'Go to March 2026')!
    await jump.trigger('click')
    await flushPromises()
    expect(wrapper.find('h3').text()).toBe('Monday, Mar 2, 2026')
  })
})
