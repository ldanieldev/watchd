import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import StatsPage from '~/pages/stats.vue'
import { statsView } from '~~/shared/utils/library/views'
import type { LibraryData } from '~~/shared/utils/library/types'
import { fixtureLibrary, useFixtureLibrary } from '~~/test/fixtures/library'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))
enableAutoUnmount(afterEach)

const StatsInApp = defineComponent({ render: () => h(UApp, null, { default: () => h(StatsPage) }) })

describe('stats page', () => {
  beforeEach(() => {
    useFixtureLibrary()
  })

  it('leads with the hours and titles for the last 12 months', async () => {
    const today = new Date()
    const expected = statsView(fixtureLibrary(today), '12m', 'all', today).total

    const wrapper = await mountSuspended(StatsInApp, { route: '/stats' })

    expect(wrapper.find('h2').text()).toBe(`${Math.round(expected.minutes / 60).toLocaleString('en')} hours across ${expected.titles} titles`)
  })

  it('shows empty states without NaN when a filter has no watches', async () => {
    const shows: LibraryData = {
      titles: [{ id: 'tulsa-king', type: 'tv', name: 'Tulsa King', firstAired: '2022-11-13', posterPath: '/p.jpg' }],
      episodes: [{ id: 'tulsa-king-1-1', titleId: 'tulsa-king', season: 1, number: 1, airDate: '2022-11-13' }],
      watches: [{ titleId: 'tulsa-king', episodeId: 'tulsa-king-1-1', watchedAt: '2026-03-02T21:00:00' }]
    }
    useFixtureLibrary(shows)
    const wrapper = await mountSuspended(StatsInApp, { route: '/stats' })

    const moviesTab = wrapper.findAll('[role="tab"]').find(tab => tab.text() === 'Movies')!
    await moviesTab.trigger('mousedown', { button: 0 })
    await moviesTab.trigger('focus')
    await flushPromises()

    expect(wrapper.find('h2').text()).toBe('0 hours across 0 titles')
    expect(wrapper.text()).toContain('Nothing here for this range')
    expect(wrapper.text()).not.toContain('NaN')
  })

  it('has no rating panels', async () => {
    const wrapper = await mountSuspended(StatsInApp, { route: '/stats' })
    expect(wrapper.text().toLowerCase()).not.toContain('rating')
  })
})

describe('stats page sections', () => {
  beforeEach(() => {
    useFixtureLibrary()
  })

  it('groups panels under plain section headings', async () => {
    const wrapper = await mountSuspended(StatsInApp, { route: '/stats' })
    expect(wrapper.findAll('h2').slice(1).map(heading => heading.text())).toEqual(['Your year', 'When you watch', 'What you watch', 'Who\'s in it', 'Your library'])
  })

  it('shows people as portraits and top titles as posters', async () => {
    const wrapper = await mountSuspended(StatsInApp, { route: '/stats' })
    expect(wrapper.findAll('a[href^="/people/"] img').length).toBeGreaterThan(5)
    expect(wrapper.findAll('ul[aria-label="Top anime"] li').length).toBe(5)
  })
})
