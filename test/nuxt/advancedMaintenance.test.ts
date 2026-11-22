import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { createError } from 'h3'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import AdvancedPage from '~/pages/settings/advanced.vue'
import type { CacheBackend } from '~~/shared/types/maintenance'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))
enableAutoUnmount(afterEach)

const AdvancedInApp = defineComponent({ render: () => h(UApp, null, { default: () => h(AdvancedPage) }) })

const routes = {
  status: { total: 10, pending: 2, ready: 6, failed: 2 },
  queued: 2,
  refreshFailure: undefined as { statusCode: number, statusMessage: string } | undefined,
  backend: 'redis' as CacheBackend,
  removed: 3,
  clearBackend: 'redis' as CacheBackend,
  statusFails: false,
  cacheFails: false,
  refreshPosts: 0,
  retryPosts: 0,
  rebuildPosts: 0,
  clearPosts: 0
}

registerEndpoint('/api/tokens', { method: 'GET', handler: () => [] })
registerEndpoint('/api/import/status', {
  method: 'GET',
  handler: () => {
    if (routes.statusFails) throw createError({ statusCode: 500, statusMessage: 'boom' })
    return routes.status
  }
})
registerEndpoint('/api/import/retry-failed', {
  method: 'POST',
  handler: () => {
    routes.retryPosts++
    return { queued: routes.status.failed }
  }
})
registerEndpoint('/api/maintenance/refresh-library', {
  method: 'POST',
  handler: () => {
    routes.refreshPosts++
    if (routes.refreshFailure) throw createError(routes.refreshFailure)
    return { queued: routes.queued }
  }
})
registerEndpoint('/api/maintenance/rebuild-search', {
  method: 'POST',
  handler: () => {
    routes.rebuildPosts++
    return { ok: true }
  }
})
registerEndpoint('/api/maintenance/cache', {
  method: 'GET',
  handler: () => {
    if (routes.cacheFails) throw createError({ statusCode: 500, statusMessage: 'boom' })
    return { backend: routes.backend }
  }
})
registerEndpoint('/api/maintenance/clear-people-cache', {
  method: 'POST',
  handler: () => {
    routes.clearPosts++
    return { removed: routes.removed, backend: routes.clearBackend }
  }
})

const mountAdvanced = () => mountSuspended(AdvancedInApp, { route: '/settings/advanced', attachTo: document.body })
const buttonNamed = (wrapper: VueWrapper, label: string) => wrapper.findAll('button').find(button => button.text() === label)

describe('advanced page maintenance panels', () => {
  beforeEach(() => {
    useToast().clear()
    routes.status = { total: 10, pending: 2, ready: 6, failed: 2 }
    routes.queued = 2
    routes.refreshFailure = undefined
    routes.backend = 'redis'
    routes.removed = 3
    routes.clearBackend = 'redis'
    routes.statusFails = false
    routes.cacheFails = false
    routes.refreshPosts = 0
    routes.retryPosts = 0
    routes.rebuildPosts = 0
    routes.clearPosts = 0
  })

  it('renders the metadata counts line from the status', async () => {
    const wrapper = await mountAdvanced()

    await vi.waitFor(() => expect(wrapper.text()).toContain('6 ready · 2 pending · 2 failed'))
  })

  it('hides Retry failed when nothing failed', async () => {
    routes.status = { total: 8, pending: 0, ready: 8, failed: 0 }
    const wrapper = await mountAdvanced()

    await vi.waitFor(() => expect(wrapper.text()).toContain('8 ready · 0 pending · 0 failed'))
    expect(buttonNamed(wrapper, 'Retry failed')).toBeUndefined()
  })

  it('retries failed titles and refetches the status', async () => {
    const wrapper = await mountAdvanced()
    await vi.waitFor(() => expect(buttonNamed(wrapper, 'Retry failed')).toBeDefined())

    routes.status = { total: 10, pending: 4, ready: 6, failed: 0 }
    await buttonNamed(wrapper, 'Retry failed')!.trigger('click')

    await vi.waitFor(() => expect(wrapper.text()).toContain('6 ready · 4 pending · 0 failed'))
    expect(routes.retryPosts).toBe(1)
  })

  it('refreshes the whole library and toasts the queued count', async () => {
    const wrapper = await mountAdvanced()
    await vi.waitFor(() => expect(buttonNamed(wrapper, 'Refresh whole library')).toBeDefined())

    await buttonNamed(wrapper, 'Refresh whole library')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Refreshing 2 titles'))
    expect(document.body.textContent).toContain('They update in the background over the next few minutes.')
    expect(routes.refreshPosts).toBe(1)
  })

  it('toasts that there is nothing to refresh when none were queued', async () => {
    routes.queued = 0
    const wrapper = await mountAdvanced()
    await vi.waitFor(() => expect(buttonNamed(wrapper, 'Refresh whole library')).toBeDefined())

    await buttonNamed(wrapper, 'Refresh whole library')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Nothing to refresh'))
    expect(document.body.textContent).toContain('Your library has no titles yet.')
  })

  it('shows the rate-limit message in an error toast', async () => {
    routes.refreshFailure = { statusCode: 429, statusMessage: 'Too many refreshes. Try again later.' }
    const wrapper = await mountAdvanced()
    await vi.waitFor(() => expect(buttonNamed(wrapper, 'Refresh whole library')).toBeDefined())

    await buttonNamed(wrapper, 'Refresh whole library')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Too many refreshes. Try again later.'))
  })

  it('rebuilds the search index once and toasts', async () => {
    const wrapper = await mountAdvanced()

    await buttonNamed(wrapper, 'Rebuild search index')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Rebuilding search'))
    expect(document.body.textContent).toContain('Search results update in a few seconds.')
    expect(routes.rebuildPosts).toBe(1)
  })

  it.each([
    ['redis', 'Redis connected'],
    ['memory-fallback', 'Redis unreachable, using in-memory cache'],
    ['memory', 'In-memory cache (no Redis configured)']
  ] as const)('renders the %s cache status line', async (backend, line) => {
    routes.backend = backend
    const wrapper = await mountAdvanced()

    await vi.waitFor(() => expect(wrapper.text()).toContain(line))
  })

  it('clears the people cache and toasts the removed count', async () => {
    const wrapper = await mountAdvanced()

    await buttonNamed(wrapper, 'Clear people cache')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Cleared 3 cached people'))
    expect(routes.clearPosts).toBe(1)
  })

  it('uses the singular when one person was cleared', async () => {
    routes.removed = 1
    const wrapper = await mountAdvanced()

    await buttonNamed(wrapper, 'Clear people cache')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Cleared 1 cached person'))
    expect(document.body.textContent).not.toContain('Cleared 1 cached people')
  })

  it('warns that Redis entries remain when the cache fell back to memory', async () => {
    routes.clearBackend = 'memory-fallback'
    const wrapper = await mountAdvanced()

    await buttonNamed(wrapper, 'Clear people cache')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Redis is unreachable, so entries stored there remain.'))
  })

  it('does not warn about Redis when the backend is healthy', async () => {
    const wrapper = await mountAdvanced()

    await buttonNamed(wrapper, 'Clear people cache')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Cleared 3 cached people'))
    expect(document.body.textContent).not.toContain('entries stored there remain')
  })

  it('says the cache status could not be loaded', async () => {
    routes.cacheFails = true
    const wrapper = await mountAdvanced()

    await vi.waitFor(() => expect(wrapper.text()).toContain('Couldn\'t load cache status'))
  })

  it('says the metadata status could not be loaded', async () => {
    routes.statusFails = true
    const wrapper = await mountAdvanced()

    await vi.waitFor(() => expect(wrapper.text()).toContain('Couldn\'t load metadata status'))
    expect(wrapper.text()).not.toContain('ready ·')
  })
})
