import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { enableAutoUnmount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import SeasonPage from '~/pages/tv/[id]/season/[season].vue'
import { useFixtureLibrary } from '~~/test/fixtures/library'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))
enableAutoUnmount(afterEach)

function rowFor(wrapper: VueWrapper, code: string): DOMWrapper<Element> {
  return wrapper.findAll('[data-episode-row]').find(row => row.text().includes(code))!
}

function buttonLabelled(row: DOMWrapper<Element>, label: string) {
  return row.findAll('button').find(button => button.text().startsWith(label))
}

describe('season detail page', () => {
  beforeEach(() => {
    useFixtureLibrary()
  })

  it('offers mark on a missing episode and unmark on a watched one', async () => {
    const wrapper = await mountSuspended(SeasonPage, { route: '/tv/tulsa-king/season/3' })

    expect(buttonLabelled(rowFor(wrapper, 'S3E7'), 'Mark watched')).toBeDefined()
    expect(buttonLabelled(rowFor(wrapper, 'S3E6'), 'Unmark')).toBeDefined()
    expect(rowFor(wrapper, 'S3E6').text()).toContain('Watched')
  })

  it('marks through the chosen episode and leaves later ones missing', async () => {
    const wrapper = await mountSuspended(SeasonPage, { route: '/tv/tulsa-king/season/3' })

    await buttonLabelled(rowFor(wrapper, 'S3E8'), 'Mark watched through here')!.trigger('click')

    expect(buttonLabelled(rowFor(wrapper, 'S3E7'), 'Unmark')).toBeDefined()
    expect(buttonLabelled(rowFor(wrapper, 'S3E8'), 'Unmark')).toBeDefined()
    expect(buttonLabelled(rowFor(wrapper, 'S3E9'), 'Mark watched')).toBeDefined()
  })

  it('unmarks a watched episode', async () => {
    const wrapper = await mountSuspended(SeasonPage, { route: '/tv/tulsa-king/season/3' })

    await buttonLabelled(rowFor(wrapper, 'S3E6'), 'Unmark')!.trigger('click')

    expect(buttonLabelled(rowFor(wrapper, 'S3E6'), 'Mark watched')).toBeDefined()
  })

  it('gives an upcoming episode no mark button', async () => {
    const wrapper = await mountSuspended(SeasonPage, { route: '/tv/tulsa-king/season/4' })
    const upcomingRow = rowFor(wrapper, 'S4E10')

    expect(upcomingRow.findAll('button')).toHaveLength(0)
  })

  it('marks the whole season from the hero and links to neighbouring seasons', async () => {
    const wrapper = await mountSuspended(SeasonPage, { route: '/tv/tulsa-king/season/3' })

    expect(wrapper.find('a[href="/tv/tulsa-king"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/tv/tulsa-king/season/2"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/tv/tulsa-king/season/4"]').exists()).toBe(true)

    const markSeason = wrapper.findAll('button').find(button => button.text() === 'Mark season watched')!
    await markSeason.trigger('click')

    expect(wrapper.findAll('[data-episode-row]').some(row => buttonLabelled(row, 'Mark watched'))).toBe(false)
  })

  it('renders specials as their own season', async () => {
    const wrapper = await mountSuspended(SeasonPage, { route: '/tv/tulsa-king/season/0' })

    expect(wrapper.find('h1').text()).toContain('Specials')
    expect(wrapper.findAll('[data-episode-row]').length).toBeGreaterThan(0)
  })

  it('does not offer mark-through on specials', async () => {
    const wrapper = await mountSuspended(SeasonPage, { route: '/tv/tulsa-king/season/0' })
    const buttonLabels = wrapper.findAll('[data-episode-row] button').map(button => button.text())

    expect(buttonLabels.some(label => label.startsWith('Mark watched'))).toBe(true)
    expect(buttonLabels.some(label => label.includes('through here'))).toBe(false)
  })

  it('renders the 1,120-episode One Piece season in batches and loads more on demand', async () => {
    const wrapper = await mountSuspended(SeasonPage, { route: '/anime/one-piece/season/1' })
    expect(wrapper.findAll('[data-episode-row]')).toHaveLength(50)

    await wrapper.findAll('button').find(button => button.text() === 'Show more episodes (1070 left)')!.trigger('click')

    expect(wrapper.findAll('[data-episode-row]')).toHaveLength(100)
  })

  it('loads the next batch when the load-more button scrolls near the viewport', async () => {
    const callbacks: IntersectionObserverCallback[] = []
    const observedTargets: Element[] = []
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback)
      }

      observe(target: Element) {
        observedTargets.push(target)
      }

      disconnect() {}
    })
    const wrapper = await mountSuspended(SeasonPage, { route: '/anime/one-piece/season/1' })

    expect(observedTargets.at(-1)?.textContent).toContain('Show more episodes')
    callbacks.at(-1)!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    await nextTick()

    expect(wrapper.findAll('[data-episode-row]')).toHaveLength(100)
    vi.unstubAllGlobals()
  })

  it('shows no load-more button when the season fits in one batch', async () => {
    const wrapper = await mountSuspended(SeasonPage, { route: '/tv/tulsa-king/season/3' })
    expect(wrapper.text()).not.toContain('Show more episodes')
  })
})
