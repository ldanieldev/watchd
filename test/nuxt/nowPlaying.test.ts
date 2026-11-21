import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { createError } from 'h3'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import MediaNowPlaying from '~/components/media/NowPlaying.vue'

enableAutoUnmount(afterEach)

const route = vi.hoisted(() => ({ items: [] as Record<string, unknown>[], fails: false, calls: 0, gate: undefined as Promise<undefined> | undefined }))

registerEndpoint('/api/plex/now-playing', async () => {
  route.calls += 1
  if (route.gate) await route.gate
  if (route.fails) throw createError({ statusCode: 500, statusMessage: 'Server Error' })
  return { items: route.items }
})

beforeEach(() => {
  route.items = []
  route.fails = false
  route.calls = 0
  route.gate = undefined
})

async function mountLine() {
  const wrapper = await mountSuspended(MediaNowPlaying)
  await vi.waitFor(() => expect(route.calls).toBeGreaterThan(0))
  await flushPromises()
  return wrapper
}

describe('MediaNowPlaying', () => {
  it('shows the title with its episode code and links to the title', async () => {
    route.items = [{ titleId: 7, type: 'tv', name: 'Severance', season: 1, number: 4 }]
    const wrapper = await mountLine()
    expect(wrapper.text()).toBe('Now playing — Severance S1E4')
    expect(wrapper.find('a').attributes('href')).toBe('/tv/7')
  })

  it('shows a movie without an episode code', async () => {
    route.items = [{ titleId: 9, type: 'movie', name: 'Heat' }]
    const wrapper = await mountLine()
    expect(wrapper.text()).toBe('Now playing — Heat')
    expect(wrapper.find('a').attributes('href')).toBe('/movies/9')
  })

  it('shows an anime episode as E4 and links to the anime section', async () => {
    route.items = [{ titleId: 5, type: 'anime', name: 'One Piece', season: 1, number: 4 }]
    const wrapper = await mountLine()
    expect(wrapper.text()).toBe('Now playing — One Piece E4')
    expect(wrapper.find('a').attributes('href')).toBe('/anime/5')
  })

  it('renders nothing when nothing is playing', async () => {
    const wrapper = await mountLine()
    expect(wrapper.text()).toBe('')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('renders nothing when the request fails', async () => {
    route.fails = true
    const wrapper = await mountLine()
    expect(wrapper.text()).toBe('')
  })

  it('polls every 15 seconds and stops after unmount', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = await mountSuspended(MediaNowPlaying)
      await flushPromises()
      expect(route.calls).toBe(1)
      await vi.advanceTimersByTimeAsync(15_000)
      expect(route.calls).toBe(2)
      wrapper.unmount()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(route.calls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  describe('visibility', () => {
    const setVisibility = (state: 'visible' | 'hidden') => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
    }
    afterEach(() => vi.restoreAllMocks())

    it('refreshes right away when the tab becomes visible again', async () => {
      setVisibility('hidden')
      await mountSuspended(MediaNowPlaying)
      expect(route.calls).toBe(0)
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      await flushPromises()
      expect(route.calls).toBe(1)
    })

    it('does not fetch on the poll interval while hidden', async () => {
      vi.useFakeTimers()
      try {
        setVisibility('hidden')
        await mountSuspended(MediaNowPlaying)
        await vi.advanceTimersByTimeAsync(45_000)
        expect(route.calls).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  it('ignores a response that arrives after unmount', async () => {
    const gate = Promise.withResolvers<undefined>()
    route.gate = gate.promise
    route.items = [{ titleId: 7, type: 'tv', name: 'Severance', season: 1, number: 4 }]
    const wrapper = await mountSuspended(MediaNowPlaying)
    wrapper.unmount()
    gate.resolve(undefined)
    await flushPromises()
    expect(wrapper.text()).toBe('')
  })
})
