import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { createError } from 'h3'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import MoviePage from '~/pages/movies/[id].vue'
import { fixtureLibrary, useFixtureLibrary } from '~~/test/fixtures/library'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))
enableAutoUnmount(afterEach)

const refreshRequests: string[] = []
const refreshOutcome = { failure: undefined as { statusCode: number, statusMessage: string } | undefined }
const PageInApp = defineComponent({ render: () => h(UApp, null, { default: () => h(MoviePage) }) })

registerEndpoint('/api/library/titles/ex-machina/refresh', {
  method: 'POST',
  handler: () => {
    refreshRequests.push('ex-machina')
    if (refreshOutcome.failure) throw createError(refreshOutcome.failure)
    return { queued: 1 }
  }
})

describe('movie detail page', () => {
  beforeEach(() => {
    useFixtureLibrary()
    useToast().clear()
    refreshRequests.length = 0
    refreshOutcome.failure = undefined
  })

  it('calls out the unwatched film in a partly watched collection', async () => {
    const wrapper = await mountSuspended(MoviePage, { route: '/movies/glass-onion-a-knives-out-mystery' })

    expect(wrapper.text()).toContain('1 film in this collection you haven\'t seen')
    const knivesOutLink = wrapper.findAll('a').find(link => link.text().includes('Knives Out') && !link.text().includes('Glass'))
    expect(knivesOutLink?.attributes('href')).toBe('/movies/knives-out')
  })

  it('marks an unreleased collection member as not released', async () => {
    const wrapper = await mountSuspended(MoviePage, { route: '/movies/dune-part-two' })

    expect(wrapper.text()).toContain('Not released · ')
    expect(wrapper.text()).toContain('Dune: Part Three')
  })

  it('hides add watch for an unreleased movie and starts the date at today', async () => {
    const unreleased = await mountSuspended(MoviePage, { route: '/movies/dune-part-three' })
    expect(unreleased.find('form').exists()).toBe(false)

    const released = await mountSuspended(MoviePage, { route: '/movies/ex-machina' })
    const dateValue = (released.find('input[type="date"]').element as HTMLInputElement).value
    expect(dateValue).toBe(released.find('input[type="date"]').attributes('max'))
  })

  it('adds a watch to raise the count and removes it again', async () => {
    const wrapper = await mountSuspended(MoviePage, { route: '/movies/ex-machina' })
    expect(wrapper.text()).toContain('Watched 1×')

    expect(wrapper.findAll('button').some(button => button.text() === 'Add watch')).toBe(true)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Watched 2×')

    await wrapper.findAll('button').find(button => button.attributes('aria-label')?.startsWith('Remove watch'))!.trigger('click')
    expect(wrapper.text()).toContain('Watched 1×')
  })

  it('shows an unwatched movie without snapshot details and no empty headings', async () => {
    const fixtures = fixtureLibrary()
    useFixtureLibrary({
      ...fixtures,
      titles: [...fixtures.titles, { id: 'no-details-movie', type: 'movie', name: 'No Details Movie', firstAired: '2020-01-01', posterPath: '/p.jpg', runtimeMinutes: 100 }]
    })
    const wrapper = await mountSuspended(MoviePage, { route: '/movies/no-details-movie' })

    expect(wrapper.text()).toContain('Not watched')
    const headings = wrapper.findAll('h2').map(heading => heading.text())
    expect(headings).not.toContain('About')
    expect(headings).not.toContain('Cast')
    expect(headings).not.toContain('Crew')
    expect(headings).not.toContain('Collection')
  })

  it('refreshes the title from TMDB and toasts', async () => {
    const wrapper = await mountSuspended(PageInApp, { route: '/movies/ex-machina', attachTo: document.body })

    await wrapper.findAll('button').find(button => button.text() === 'Refresh from TMDB')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Refreshing Ex Machina'))
    expect(document.body.textContent).toContain('Reload the page in a minute to see the changes.')
    expect(refreshRequests).toEqual(['ex-machina'])
  })

  it('toasts when the refresh fails', async () => {
    refreshOutcome.failure = { statusCode: 429, statusMessage: 'Too many refreshes' }
    const wrapper = await mountSuspended(PageInApp, { route: '/movies/ex-machina', attachTo: document.body })

    await wrapper.findAll('button').find(button => button.text() === 'Refresh from TMDB')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Couldn\'t refresh Ex Machina'))
  })
})
