import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import MoviePage from '~/pages/movies/[id].vue'
import { fixtureLibrary, useFixtureLibrary } from '~~/test/fixtures/library'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))
enableAutoUnmount(afterEach)

describe('movie detail page', () => {
  beforeEach(() => {
    useFixtureLibrary()
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
})
