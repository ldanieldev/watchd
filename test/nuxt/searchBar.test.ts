import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createError, getQuery } from 'h3'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { UApp, USelect } from '#components'
import SearchBar from '~/components/searchBar.vue'
import type { SearchHit } from '~~/shared/types/search'

enableAutoUnmount(afterEach)

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const SearchBarInApp = defineComponent({ render: () => h(UApp, null, { default: () => h(SearchBar) }) })

const DEBOUNCE_MS = 150

// Reka's Escape listener sits on window, which a detached mount never bubbles to.
function mountSearchBar() {
  return mountSuspended(SearchBarInApp, { attachTo: document.body })
}

function makeHit(overrides: Partial<SearchHit> = {}): SearchHit {
  return { titleId: '1', type: 'anime', name: 'Attack on Titan', year: '2013', posterPath: null, matchedAlias: null, ...overrides }
}

function optionElements() {
  return [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]
}

function listboxText() {
  return document.body.querySelector('[role="listbox"]')?.closest('[data-slot="content"]')?.textContent ?? ''
}

async function typeQuery(wrapper: VueWrapper, text: string) {
  await wrapper.find('input[role="combobox"]').setValue(text)
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
  await flushPromises()
}

async function pressKey(wrapper: VueWrapper, key: string) {
  await wrapper.find('input[role="combobox"]').trigger('keydown', { key })
  await vi.advanceTimersByTimeAsync(20)
  await flushPromises()
}

describe('search bar dropdown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    navigateToMock.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('shows up to 8 results after typing', async () => {
    registerEndpoint('/api/search', () => Array.from({ length: 10 }, (_, index) => makeHit({ titleId: String(index + 1), name: `Title ${index + 1}` })))
    const wrapper = await mountSearchBar()

    await typeQuery(wrapper, 'title')

    await vi.waitFor(() => expect(optionElements()).toHaveLength(8))
    expect(optionElements()[0]!.textContent).toContain('Title 1')
    expect(optionElements()[0]!.textContent).toContain('Anime · 2013')
  })

  it('shows the also line for an alias match', async () => {
    registerEndpoint('/api/search', () => [makeHit({ matchedAlias: 'Shingeki no Kyojin' })])
    const wrapper = await mountSearchBar()

    await typeQuery(wrapper, 'shingeki')

    await vi.waitFor(() => expect(optionElements()).toHaveLength(1))
    expect(optionElements()[0]!.textContent).toContain('also: Shingeki no Kyojin')
  })

  it('ignores a stale response', async () => {
    let releaseShorterQuery!: () => void
    const shorterQueryGate = new Promise<void>((resolve) => {
      releaseShorterQuery = resolve
    })
    registerEndpoint('/api/search', async (event) => {
      const { q } = getQuery(event)
      if (q === 'dar') {
        await shorterQueryGate
        return [makeHit({ titleId: '1', name: 'Darling in the Franxx' })]
      }
      return [makeHit({ titleId: '2', name: 'Dark', type: 'tv', year: '2017' })]
    })
    const wrapper = await mountSearchBar()

    await typeQuery(wrapper, 'dar')
    await typeQuery(wrapper, 'dark')
    await vi.waitFor(() => expect(optionElements().map(option => option.textContent)).toEqual([expect.stringContaining('Dark')]))

    releaseShorterQuery()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await flushPromises()

    expect(optionElements()).toHaveLength(1)
    expect(optionElements()[0]!.textContent).toContain('Dark')
    expect(optionElements()[0]!.textContent).not.toContain('Darling')
  })

  it('arrow keys move the highlight and Enter opens it', async () => {
    registerEndpoint('/api/search', () => [
      makeHit({ titleId: '10', name: 'Attack on Titan' }),
      makeHit({ titleId: '11', name: 'Attack on Titan: Junior High' }),
      makeHit({ titleId: '12', name: 'Attack on Titan: No Regrets' })
    ])
    const wrapper = await mountSearchBar()
    await typeQuery(wrapper, 'attack')
    await vi.waitFor(() => expect(optionElements()).toHaveLength(3))

    await pressKey(wrapper, 'ArrowDown')
    await pressKey(wrapper, 'ArrowDown')
    expect(optionElements()[2]!.hasAttribute('data-highlighted')).toBe(true)
    await pressKey(wrapper, 'Enter')

    expect(navigateToMock).toHaveBeenCalledWith('/anime/12')
  })

  it('Enter with nothing highlighted opens the first result', async () => {
    registerEndpoint('/api/search', () => [
      makeHit({ titleId: '10', name: 'Attack on Titan' }),
      makeHit({ titleId: '11', name: 'Attack on Titan: Junior High' })
    ])
    const wrapper = await mountSearchBar()
    await typeQuery(wrapper, 'attack')
    await vi.waitFor(() => expect(optionElements()).toHaveLength(2))
    await wrapper.find('[data-slot="root"]').trigger('pointerleave')
    await flushPromises()
    expect(optionElements().some(option => option.hasAttribute('data-highlighted'))).toBe(false)

    await pressKey(wrapper, 'Enter')

    expect(navigateToMock).toHaveBeenCalledWith('/anime/10')
  })

  it('Enter while the next query is still loading opens that query\'s first result, not the previous one', async () => {
    let releaseLongerQuery!: () => void
    const longerQueryGate = new Promise<void>((resolve) => {
      releaseLongerQuery = resolve
    })
    registerEndpoint('/api/search', async (event) => {
      if (getQuery(event).q === 'lo') return [makeHit({ titleId: '1', name: 'Lovely Complex' })]
      await longerQueryGate
      return [makeHit({ titleId: '2', name: 'Lost', type: 'tv', year: '2004' })]
    })
    const wrapper = await mountSearchBar()
    await typeQuery(wrapper, 'lo')
    await vi.waitFor(() => expect(optionElements()).toHaveLength(1))
    await wrapper.find('[data-slot="root"]').trigger('pointerleave')
    await flushPromises()

    await wrapper.find('input[role="combobox"]').setValue('lost')
    await pressKey(wrapper, 'Enter')
    expect(navigateToMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await flushPromises()
    expect(navigateToMock).not.toHaveBeenCalled()

    releaseLongerQuery()
    await vi.waitFor(() => expect(navigateToMock).toHaveBeenCalledWith('/tv/2'))
    expect(navigateToMock).toHaveBeenCalledTimes(1)
  })

  it('Enter on a row picked with the arrow keys while loading still opens that row', async () => {
    registerEndpoint('/api/search', () => [makeHit({ titleId: '1', name: 'Lovely Complex' }), makeHit({ titleId: '3', name: 'Log Horizon' })])
    const wrapper = await mountSearchBar()
    await typeQuery(wrapper, 'lo')
    await vi.waitFor(() => expect(optionElements()).toHaveLength(2))

    await wrapper.find('input[role="combobox"]').setValue('log')
    await pressKey(wrapper, 'ArrowDown')
    await pressKey(wrapper, 'Enter')

    expect(navigateToMock).toHaveBeenCalledWith('/anime/3')
  })

  it('Enter while loading navigates nowhere when the query returns no results', async () => {
    registerEndpoint('/api/search', event => getQuery(event).q === 'lo' ? [makeHit({ titleId: '1', name: 'Lovely Complex' })] : [])
    const wrapper = await mountSearchBar()
    await typeQuery(wrapper, 'lo')
    await vi.waitFor(() => expect(optionElements()).toHaveLength(1))
    await wrapper.find('[data-slot="root"]').trigger('pointerleave')
    await flushPromises()

    await wrapper.find('input[role="combobox"]').setValue('lozzz')
    await pressKey(wrapper, 'Enter')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await flushPromises()

    await vi.waitFor(() => expect(listboxText()).toContain('No matches in your library'))
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('ignores an Enter that commits an IME composition when nothing is highlighted', async () => {
    registerEndpoint('/api/search', () => [makeHit({ titleId: '10' })])
    const wrapper = await mountSearchBar()
    await typeQuery(wrapper, 'shingeki')
    await vi.waitFor(() => expect(optionElements()).toHaveLength(1))
    await wrapper.find('[data-slot="root"]').trigger('pointerleave')
    await flushPromises()

    await wrapper.find('input[role="combobox"]').trigger('keydown', { key: 'Enter', isComposing: true })
    await flushPromises()

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('ignores an Enter that commits an IME composition on a highlighted row', async () => {
    registerEndpoint('/api/search', () => [makeHit({ titleId: '10' }), makeHit({ titleId: '11' })])
    const wrapper = await mountSearchBar()
    await typeQuery(wrapper, 'shingeki')
    await vi.waitFor(() => expect(optionElements()).toHaveLength(2))
    await pressKey(wrapper, 'ArrowDown')
    expect(optionElements()[1]!.hasAttribute('data-highlighted')).toBe(true)
    const input = wrapper.find('input[role="combobox"]')

    await input.trigger('compositionstart')
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    await flushPromises()

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it.each([
    ['nothing', async () => {}, true],
    ['Escape', (wrapper: VueWrapper) => pressKey(wrapper, 'Escape'), false],
    ['leaving the input', (wrapper: VueWrapper) => wrapper.find('input[role="combobox"]').trigger('focusout'), false],
    ['an arrow key', (wrapper: VueWrapper) => pressKey(wrapper, 'ArrowDown'), false]
  ])('%s after an Enter held for the first query decides whether it opens the first result', async (_label, actAfterEnter, shouldNavigate) => {
    let releaseQuery!: () => void
    const queryGate = new Promise<void>((resolve) => {
      releaseQuery = resolve
    })
    let hasResponded = false
    registerEndpoint('/api/search', async () => {
      await queryGate
      hasResponded = true
      return [makeHit({ titleId: '2', name: 'Lost', type: 'tv', year: '2004' })]
    })
    const wrapper = await mountSearchBar()
    await wrapper.find('input[role="combobox"]').setValue('lost')
    await pressKey(wrapper, 'Enter')
    await actAfterEnter(wrapper)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await flushPromises()
    expect(navigateToMock).not.toHaveBeenCalled()

    releaseQuery()
    await vi.waitFor(() => expect(hasResponded).toBe(true))
    await vi.advanceTimersByTimeAsync(20)
    await flushPromises()
    if (shouldNavigate) expect(navigateToMock).toHaveBeenCalledWith('/tv/2')
    else expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('Enter on a row picked with End while loading still opens that row', async () => {
    registerEndpoint('/api/search', () => [makeHit({ titleId: '1', name: 'Lovely Complex' }), makeHit({ titleId: '3', name: 'Log Horizon' })])
    const wrapper = await mountSearchBar()
    await typeQuery(wrapper, 'lo')
    await vi.waitFor(() => expect(optionElements()).toHaveLength(2))

    await wrapper.find('input[role="combobox"]').setValue('log')
    await pressKey(wrapper, 'End')
    await pressKey(wrapper, 'Enter')

    expect(navigateToMock).toHaveBeenCalledWith('/anime/3')
  })

  it('Escape closes the dropdown', async () => {
    registerEndpoint('/api/search', () => [makeHit()])
    const wrapper = await mountSearchBar()
    await typeQuery(wrapper, 'attack')
    await vi.waitFor(() => expect(optionElements()).toHaveLength(1))

    await pressKey(wrapper, 'Escape')

    await vi.waitFor(() => expect(optionElements()).toHaveLength(0))
    expect(wrapper.find('input[role="combobox"]').attributes('aria-expanded')).toBe('false')
  })

  it('shows "No matches in your library" for an empty result', async () => {
    registerEndpoint('/api/search', () => [])
    const wrapper = await mountSearchBar()

    await typeQuery(wrapper, 'zzzz')

    await vi.waitFor(() => expect(listboxText()).toContain('No matches in your library'))
  })

  it('shows "Search is unavailable" for a 503', async () => {
    registerEndpoint('/api/search', () => {
      throw createError({ statusCode: 503, statusMessage: 'Search is unavailable' })
    })
    const wrapper = await mountSearchBar()

    await typeQuery(wrapper, 'attack')

    await vi.waitFor(() => expect(listboxText()).toContain('Search is unavailable'))
  })

  it('changing the category re-queries with category=anime', async () => {
    const requestedCategories: unknown[] = []
    registerEndpoint('/api/search', (event) => {
      requestedCategories.push(getQuery(event).category)
      return [makeHit()]
    })
    const wrapper = await mountSearchBar()
    await typeQuery(wrapper, 'attack')
    await vi.waitFor(() => expect(requestedCategories).toEqual(['all']))

    wrapper.findComponent(USelect).vm.$emit('update:modelValue', 'anime')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await flushPromises()

    await vi.waitFor(() => expect(requestedCategories).toEqual(['all', 'anime']))
  })

  it('exposes the input as a combobox that controls a listbox', async () => {
    registerEndpoint('/api/search', () => [makeHit()])
    const wrapper = await mountSearchBar()
    const input = wrapper.find('input[role="combobox"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('aria-expanded')).toBe('false')

    await typeQuery(wrapper, 'attack')

    await vi.waitFor(() => expect(input.attributes('aria-expanded')).toBe('true'))
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull()
  })
})
