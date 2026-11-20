import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { personPath, seasonPath, titlePath } from '~/utils/library/paths'
import { useDetailTitle } from '~/composables/useDetailTitle'

describe('path helpers', () => {
  it('builds the detail paths', () => {
    expect(titlePath({ id: 'x', type: 'tv' })).toBe('/tv/x')
    expect(titlePath({ id: 'x', type: 'anime' })).toBe('/anime/x')
    expect(titlePath({ id: 'x', type: 'movie' })).toBe('/movies/x')
    expect(seasonPath({ id: 'x', type: 'tv' }, 3)).toBe('/tv/x/season/3')
    expect(seasonPath({ id: 'x', type: 'anime' }, 0)).toBe('/anime/x/season/0')
    expect(personPath(123)).toBe('/people/123')
  })
})

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))

function probe(expectedType: 'episodic' | 'movie') {
  return defineComponent({
    setup() {
      const { title, season } = useDetailTitle(expectedType)
      return () => h('p', `${title.value.name}|${season.value ?? 'none'}`)
    }
  })
}

describe('useDetailTitle', () => {
  it('renders a known title with no season', async () => {
    const wrapper = await mountSuspended(probe('episodic'), { route: '/tv/tulsa-king' })
    expect(wrapper.text()).toBe('Tulsa King|none')
  })

  it('exposes a valid season including specials', async () => {
    const regular = await mountSuspended(probe('episodic'), { route: '/tv/tulsa-king/season/3' })
    expect(regular.text()).toBe('Tulsa King|3')
    const specials = await mountSuspended(probe('episodic'), { route: '/tv/tulsa-king/season/0' })
    expect(specials.text()).toBe('Tulsa King|0')
  })

  it('throws a 404 for an unknown title', async () => {
    await expect(mountSuspended(probe('episodic'), { route: '/tv/nope' })).rejects.toMatchObject({ statusCode: 404 })
  })

  it.each(['9', '-1', '1.5', 'abc'])('throws a 404 for season %s', async (season) => {
    await expect(mountSuspended(probe('episodic'), { route: `/tv/tulsa-king/season/${season}` })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('redirects a show opened under movies to its tv path', async () => {
    await mountSuspended(probe('movie'), { route: '/movies/tulsa-king' })
    await vi.waitFor(() => expect(useRoute().path).toBe('/tv/tulsa-king'))
  })

  it('redirects an anime opened under tv to its anime path', async () => {
    await mountSuspended(probe('episodic'), { route: '/tv/frieren-beyond-journey-s-end' })
    await vi.waitFor(() => expect(useRoute().path).toBe('/anime/frieren-beyond-journey-s-end'))
  })

  it('keeps the season when redirecting an anime season opened under tv', async () => {
    await mountSuspended(probe('episodic'), { route: '/tv/frieren-beyond-journey-s-end/season/1' })
    await vi.waitFor(() => expect(useRoute().path).toBe('/anime/frieren-beyond-journey-s-end/season/1'))
  })

  it('redirects a movie season url to the movie page', async () => {
    await mountSuspended(probe('episodic'), { route: '/tv/transporter-2/season/1' })
    await vi.waitFor(() => expect(useRoute().path).toBe('/movies/transporter-2'))
  })

  it('redirects a movie opened under tv to its movies path', async () => {
    await mountSuspended(probe('episodic'), { route: '/tv/transporter-2' })
    await vi.waitFor(() => expect(useRoute().path).toBe('/movies/transporter-2'))
  })
})
