import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import PersonPage from '~/pages/people/[id].vue'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))
enableAutoUnmount(afterEach)

async function mountWithFullFilmography() {
  const wrapper = await mountSuspended(PersonPage, { route: '/people/16483' })
  await wrapper.findAll('button').find(button => button.text().startsWith('Show all'))!.trigger('click')
  return wrapper
}

function layoutBiography(scrollHeight: number, clientHeight: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight)
}

describe('person detail page', () => {
  beforeEach(() => {
    clearNuxtState(['library', 'library-today'])
    layoutBiography(400, 120)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the header facts and the watched shelf with Tulsa King', async () => {
    const wrapper = await mountSuspended(PersonPage, { route: '/people/16483' })

    expect(wrapper.find('h1').text()).toBe('Sylvester Stallone')
    expect(wrapper.text()).toContain('New York City, New York, USA')
    expect(wrapper.text()).toContain('Show more')
    const shelf = wrapper.find('ul[aria-label="You\'ve watched 1 of their titles"]')
    expect(wrapper.text()).toContain('You\'ve watched 1 of their titles')
    expect(shelf.find('a[href="/tv/tulsa-king"]').exists()).toBe(true)
  })

  it('links a library credit to its Watchd page with a check and other credits to TMDB in a new tab', async () => {
    const wrapper = await mountWithFullFilmography()
    const cards = wrapper.findAll('ul[aria-label="Filmography"] li')

    const tulsaKingLink = cards.find(card => card.text().includes('Tulsa King'))!.find('a')
    expect(tulsaKingLink.attributes('href')).toBe('/tv/tulsa-king')
    expect(tulsaKingLink.attributes('target')).toBeUndefined()

    const friscoKingCard = cards.find(card => card.text().includes('Frisco King'))!
    const friscoKingLink = friscoKingCard.find('a')
    expect(friscoKingLink.attributes('href')).toMatch(/^https:\/\/www\.themoviedb\.org\/tv\/\d+$/)
    expect(friscoKingLink.attributes('target')).toBe('_blank')
    expect(friscoKingLink.attributes('rel')).toContain('noopener')
    expect(friscoKingCard.text()).toContain('Opens TMDB in a new tab')
    expect(friscoKingCard.text()).not.toContain('Watched')
  })

  it('names the watched mark for screen readers and omits the see-all link on the watched shelf', async () => {
    const wrapper = await mountWithFullFilmography()
    const tulsaKingRow = wrapper.findAll('ul[aria-label="Filmography"] li').find(row => row.text().includes('Tulsa King'))!
    expect(tulsaKingRow.findAll('.sr-only').map(element => element.text())).toContain('Watched')
    expect(wrapper.text()).not.toContain('See all')
  })

  it('shows two rows of credits until Show all is pressed, with the full title, year and role in the tooltip', async () => {
    const wrapper = await mountSuspended(PersonPage, { route: '/people/16483' })
    expect(wrapper.findAll('ul[aria-label="Filmography"] li')).toHaveLength(8)
    expect(wrapper.find('ul[aria-label="Filmography"] a').attributes('title')).toMatch(/^.+ · \d{4} · .+$/)

    const toggle = wrapper.findAll('button').find(button => button.text() === 'Show all 40')!
    await toggle.trigger('click')

    expect(wrapper.findAll('ul[aria-label="Filmography"] li')).toHaveLength(40)
    expect(toggle.text()).toBe('Show fewer')
  })

  it('hides tv credits under the Movies tab', async () => {
    const wrapper = await mountSuspended(PersonPage, { route: '/people/16483' })
    expect(wrapper.find('ul[aria-label="Filmography"]').text()).toContain('Frisco King')

    await wrapper.findAll('[role="tab"]').find(tab => tab.text().startsWith('Movies'))!.trigger('mousedown')

    const filmography = wrapper.find('ul[aria-label="Filmography"]')
    expect(filmography.text()).not.toContain('Frisco King')
    expect(filmography.text()).toContain('John Rambo')
  })

  it('expands the biography', async () => {
    const wrapper = await mountSuspended(PersonPage, { route: '/people/16483' })
    const toggle = wrapper.findAll('button').find(button => button.text() === 'Show more')!
    await toggle.trigger('click')
    expect(toggle.text()).toBe('Show less')
  })

  it('leaves out the biography toggle when the biography fits', async () => {
    layoutBiography(120, 120)
    const wrapper = await mountSuspended(PersonPage, { route: '/people/16483' })
    expect(wrapper.text()).not.toContain('Show more')
  })

  it('404s for an uncaptured person', async () => {
    await expect(mountSuspended(PersonPage, { route: '/people/1' })).rejects.toMatchObject({ statusCode: 404 })
  })
})
