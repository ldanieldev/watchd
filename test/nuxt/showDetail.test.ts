import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { createError } from 'h3'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import ShowPage from '~/pages/tv/[id]/index.vue'
import { fixtureLibrary, useFixtureLibrary } from '~~/test/fixtures/library'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))
enableAutoUnmount(afterEach)

const refreshRequests: string[] = []
const refreshOutcome = { failure: undefined as { statusCode: number, statusMessage: string } | undefined }
const PageInApp = defineComponent({ render: () => h(UApp, null, { default: () => h(ShowPage) }) })

registerEndpoint('/api/library/titles/tulsa-king/refresh', {
  method: 'POST',
  handler: () => {
    refreshRequests.push('tulsa-king')
    if (refreshOutcome.failure) throw createError(refreshOutcome.failure)
    return { queued: 1 }
  }
})

describe('show detail page', () => {
  beforeEach(() => {
    useFixtureLibrary()
    useToast().clear()
    refreshRequests.length = 0
    refreshOutcome.failure = undefined
  })

  it('lists the mid-series gap with a link to its season page', async () => {
    const wrapper = await mountSuspended(ShowPage, { route: '/tv/tulsa-king' })
    const gapLink = wrapper.findAll('a').find(link => link.text().includes('S3 E7–E10'))

    expect(gapLink?.attributes('href')).toBe('/tv/tulsa-king/season/3')
    expect(wrapper.text()).toContain('S4E9 airs tomorrow')
    expect(wrapper.findAll('h2').map(heading => heading.text())).toEqual(expect.arrayContaining(['About', 'Cast', 'Crew']))
    expect(wrapper.find('a[href="/people/16483"]').text()).toContain('Sylvester Stallone')
  })

  it('puts the specials row last', async () => {
    const wrapper = await mountSuspended(ShowPage, { route: '/tv/tulsa-king' })
    const seasonRows = wrapper.findAll('[aria-label="Seasons"] > li')

    expect(seasonRows.length).toBe(5)
    expect(seasonRows.at(-1)!.text()).toContain('Specials')
  })

  it('renders a title without snapshot details and no cast or crew shelves', async () => {
    const fixtures = fixtureLibrary()
    useFixtureLibrary({
      ...fixtures,
      titles: [...fixtures.titles, { id: 'no-details-show', type: 'tv', name: 'No Details Show', firstAired: '2020-01-01', posterPath: '/p.jpg' }],
      episodes: [...fixtures.episodes, { id: 'no-details-show-1-1', titleId: 'no-details-show', season: 1, number: 1, airDate: '2020-01-01' }]
    })
    const wrapper = await mountSuspended(ShowPage, { route: '/tv/no-details-show' })

    expect(wrapper.find('h1').text()).toBe('No Details Show')
    const headings = wrapper.findAll('h2').map(heading => heading.text())
    expect(headings).not.toContain('About')
    expect(headings).not.toContain('Cast')
    expect(headings).not.toContain('Crew')
    expect(wrapper.find('dl').text()).toContain('First aired')
  })

  it('clears the gap after marking season 3 watched', async () => {
    const wrapper = await mountSuspended(ShowPage, { route: '/tv/tulsa-king' })
    const seasonThreeRow = wrapper.findAll('[aria-label="Seasons"] > li').find(row => row.text().includes('Season 3'))!
    const markButton = seasonThreeRow.findAll('button').find(button => button.text().startsWith('Mark season watched'))!

    await markButton.trigger('click')

    expect(wrapper.text()).not.toContain('S3 E7–E10')
  })

  it('refreshes the title from TMDB and toasts', async () => {
    const wrapper = await mountSuspended(PageInApp, { route: '/tv/tulsa-king', attachTo: document.body })

    await wrapper.findAll('button').find(button => button.text() === 'Refresh from TMDB')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Refreshing Tulsa King'))
    expect(document.body.textContent).toContain('Reload the page in a minute to see the changes.')
    expect(refreshRequests).toEqual(['tulsa-king'])
  })

  it('toasts when the refresh fails', async () => {
    refreshOutcome.failure = { statusCode: 429, statusMessage: 'Too many refreshes' }
    const wrapper = await mountSuspended(PageInApp, { route: '/tv/tulsa-king', attachTo: document.body })

    await wrapper.findAll('button').find(button => button.text() === 'Refresh from TMDB')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Couldn\'t refresh Tulsa King'))
  })
})
