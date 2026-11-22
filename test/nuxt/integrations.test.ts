import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import IntegrationsPage from '~/pages/settings/integrations.vue'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))
enableAutoUnmount(afterEach)

const IntegrationsInApp = defineComponent({ render: () => h(UApp, null, { default: () => h(IntegrationsPage) }) })

const connectedStatus = {
  connected: true,
  serverName: 'PlexMediaVault',
  mode: 'on',
  listener: { state: 'connected', since: Date.parse('2026-11-21T10:00:00Z') },
  lastPlayAt: '2026-11-21T09:30:00.000Z',
  lastScanAt: '2026-11-21T09:55:00.000Z',
  tokenInvalid: false,
  sectionsAvailable: true,
  sections: [
    { id: '1', title: 'Movies', type: 'movie', checked: true },
    { id: '2', title: 'TV Shows', type: 'show', checked: true },
    { id: '5', title: 'Home Videos', type: 'movie', checked: false }
  ],
  report: null
}

const unmarkedSeverance = { id: 7, titleName: 'Severance', episodeCode: 'S2E4', plays: 2, unmarkedAt: '2026-11-20T10:00:00.000Z', daysLeft: 29 }
const unmarkedOnePiece = { id: 8, titleName: 'One Piece', episodeCode: 'E1071', plays: 1, unmarkedAt: '2026-11-19T10:00:00.000Z', daysLeft: 28 }

const routes = vi.hoisted(() => ({
  status: {} as Record<string, unknown>,
  statusCalls: 0,
  statusFails: false,
  unmarked: [] as Record<string, unknown>[],
  unmarkedFails: false,
  unmatchedFails: false,
  restored: [] as number[],
  connectBodies: [] as unknown[],
  connectFailure: '' as string,
  waitingPinChecks: 0,
  queued: [] as string[],
  disconnects: 0
}))

const failWhen = (shouldFail: boolean) => {
  if (shouldFail) throw createError({ statusCode: 500, statusMessage: 'Server Error' })
}

registerEndpoint('/api/plex/status', { handler: () => {
  routes.statusCalls += 1
  failWhen(routes.statusFails)
  return routes.status
} })
registerEndpoint('/api/plex/unmarked', { handler: () => {
  failWhen(routes.unmarkedFails)
  return { items: routes.unmarked }
} })
registerEndpoint('/api/plex/unmatched', { handler: () => {
  failWhen(routes.unmatchedFails)
  return { items: [], unresolvedHistory: 0 }
} })
for (const id of [7, 8]) {
  registerEndpoint(`/api/plex/unmarked/${id}/restore`, { method: 'POST', handler: () => {
    routes.restored.push(id)
    return { restored: 1 }
  } })
}
registerEndpoint('/api/plex/pin/42', { handler: () => ({
  state: 'signed-in',
  servers: [{ machineId: 'vault', name: 'PlexMediaVault' }, { machineId: 'attic', name: 'Attic Server' }]
}) })
registerEndpoint('/api/plex/pin/43', { handler: () => {
  routes.waitingPinChecks += 1
  return { state: 'waiting' }
} })
registerEndpoint('/api/plex/connect', { method: 'POST', handler: async (event) => {
  routes.connectBodies.push(await readBody(event))
  if (routes.connectFailure) throw createError({ statusCode: 400, statusMessage: routes.connectFailure })
  routes.status = { ...connectedStatus, serverName: 'Attic Server' }
  return { connected: true, serverName: 'Attic Server' }
} })
for (const job of ['scan', 'reconcile']) {
  registerEndpoint(`/api/plex/${job}`, { method: 'POST', handler: () => {
    routes.queued.push(job)
    return { queued: true }
  } })
}
registerEndpoint('/api/plex/connection', { method: 'DELETE', handler: () => {
  routes.disconnects += 1
  routes.status = { connected: false, mode: 'on' }
  return { success: true }
} })

const buttonNamed = (wrapper: VueWrapper, label: string) => wrapper.findAll('button').find(button => button.text() === label)
const sectionTitled = (wrapper: VueWrapper, title: string) => wrapper.findAll('section').find(section => section.find('h2').text().startsWith(title))
const mountAt = (route: string) => mountSuspended(IntegrationsInApp, { route, attachTo: document.body })
// mountSuspended hangs under fake timers; switch to them only once the page has mounted.
const useFakeClock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })

describe('integrations page', () => {
  beforeEach(() => {
    routes.status = { connected: false, mode: 'on' }
    routes.statusCalls = 0
    routes.statusFails = false
    routes.unmarked = []
    routes.unmarkedFails = false
    routes.unmatchedFails = false
    routes.restored = []
    routes.connectBodies = []
    routes.connectFailure = ''
    routes.waitingPinChecks = 0
    routes.queued = []
    routes.disconnects = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('offers Plex sign-in while disconnected', async () => {
    const wrapper = await mountAt('/settings/integrations')

    await vi.waitFor(() => expect(buttonNamed(wrapper, 'Sign in with Plex')).toBeDefined())
    expect(wrapper.text()).not.toContain('Connected to')
  })

  it('shows the connected server and the listener state', async () => {
    routes.status = connectedStatus
    const wrapper = await mountAt('/settings/integrations')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Connected to PlexMediaVault'))
    expect(wrapper.text()).toContain('Listening for plays')
    expect(buttonNamed(wrapper, 'Sign in with Plex')).toBeUndefined()
  })

  it('asks to sign in again when Plex rejects the saved sign-in', async () => {
    routes.status = { ...connectedStatus, tokenInvalid: true }
    const wrapper = await mountAt('/settings/integrations')

    await vi.waitFor(() => expect(buttonNamed(wrapper, 'Sign in again')).toBeDefined())
  })

  it('restores an unmarked item through the restore route, drops its row and moves focus on', async () => {
    routes.status = connectedStatus
    routes.unmarked = [unmarkedSeverance, unmarkedOnePiece]
    const wrapper = await mountAt('/settings/integrations')

    await vi.waitFor(() => expect(sectionTitled(wrapper, 'Unmarked in Plex')?.text()).toContain('Severance S2E4'))
    const unmarked = sectionTitled(wrapper, 'Unmarked in Plex')!
    expect(unmarked.text()).toContain('2 plays, 29 days left')

    await unmarked.find('button[aria-label="Restore Severance S2E4"]').trigger('click')
    await vi.waitFor(() => expect(unmarked.text()).not.toContain('Severance'))
    expect(routes.restored).toEqual([7])
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Restore One Piece E1071'))

    await unmarked.find('button[aria-label="Restore One Piece E1071"]').trigger('click')
    await vi.waitFor(() => expect(unmarked.text()).toContain('Nothing has been unmarked in Plex.'))
    expect(routes.restored).toEqual([7, 8])
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('plex-unmarked-title'))
  })

  it('notes read-only mode only when the server runs read-only', async () => {
    routes.status = connectedStatus
    const syncing = await mountAt('/settings/integrations')
    await vi.waitFor(() => expect(syncing.text()).toContain('Connected to PlexMediaVault'))
    expect(syncing.text()).not.toContain('Read-only: watchd isn\'t changing Plex')
    syncing.unmount()

    routes.status = { ...connectedStatus, mode: 'read-only' }
    const readOnly = await mountAt('/settings/integrations')
    await vi.waitFor(() => expect(readOnly.text()).toContain('Read-only: watchd isn\'t changing Plex'))
  })

  it('shows empty states for both lists', async () => {
    routes.status = connectedStatus
    const wrapper = await mountAt('/settings/integrations')

    await vi.waitFor(() => expect(sectionTitled(wrapper, 'Unmarked in Plex')?.text()).toContain('Nothing has been unmarked in Plex.'))
    await vi.waitFor(() => expect(sectionTitled(wrapper, 'Not matched')?.text()).toContain('Everything in your checked libraries is matched.'))
  })

  it('keeps both lists on screen with an alert when they fail to load', async () => {
    routes.status = connectedStatus
    routes.unmarkedFails = true
    routes.unmatchedFails = true
    const wrapper = await mountAt('/settings/integrations')

    await vi.waitFor(() => expect(sectionTitled(wrapper, 'Unmarked in Plex')?.find('[role="alert"]').text())
      .toBe('Couldn\'t load what was unmarked in Plex. Reload the page to try again.'))
    await vi.waitFor(() => expect(sectionTitled(wrapper, 'Not matched')?.find('[role="alert"]').text())
      .toBe('Couldn\'t load the unmatched Plex items. Reload the page to try again.'))
  })

  it('connects to the server picked after returning from Plex and focuses the status', async () => {
    const wrapper = await mountAt('/settings/integrations?pin=42')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Attic Server'))
    await wrapper.findAll('[role="radio"]').find(radio => radio.attributes('value') === 'attic')!.trigger('click')
    await wrapper.find('input[type="url"]').setValue('http://192.168.1.20:32400')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(routes.connectBodies).toEqual([{ pinId: 42, machineId: 'attic', serverUrlOverride: 'http://192.168.1.20:32400' }]))
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('plex-status-title'))
    expect(wrapper.text()).toContain('Connected to Attic Server')
    expect(wrapper.text()).not.toContain('Server URL')
  })

  it('shows the server\'s reason when connecting fails', async () => {
    routes.connectFailure = 'This Plex account isn\'t the server owner'
    const wrapper = await mountAt('/settings/integrations?pin=42')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Attic Server'))
    await wrapper.findAll('[role="radio"]').find(radio => radio.attributes('value') === 'vault')!.trigger('click')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.text()).toContain('This Plex account isn\'t the server owner'))
    expect(routes.connectBodies).toEqual([{ pinId: 42, machineId: 'vault' }])
  })

  it('gives up waiting for Plex after 2 minutes', async () => {
    const wrapper = await mountAt('/settings/integrations?pin=43')
    await vi.waitFor(() => expect(routes.waitingPinChecks).toBe(1))
    expect(wrapper.text()).toContain('Waiting for Plex to confirm the sign-in')
    useFakeClock()
    await vi.waitFor(() => expect(routes.waitingPinChecks).toBe(2), { timeout: 3000 })

    await vi.advanceTimersByTimeAsync(1000)
    await vi.waitFor(() => expect(routes.waitingPinChecks).toBe(3), { timeout: 3000 })

    vi.setSystemTime(Date.now() + 2 * 60 * 1000)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Plex didn\'t confirm the sign-in within 2 minutes'), { timeout: 3000 })
    const checksAtTimeout = routes.waitingPinChecks

    await vi.advanceTimersByTimeAsync(10_000)
    expect(routes.waitingPinChecks).toBe(checksAtTimeout)
    expect(buttonNamed(wrapper, 'Sign in with Plex')).toBeDefined()
  })

  it('stops checking the sign-in once the page is left', async () => {
    const wrapper = await mountAt('/settings/integrations?pin=43')
    await vi.waitFor(() => expect(routes.waitingPinChecks).toBe(1))
    useFakeClock()
    await vi.waitFor(() => expect(routes.waitingPinChecks).toBe(2), { timeout: 3000 })

    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(routes.waitingPinChecks).toBe(2)
  })

  it('refreshes the status after a scan until the scan finishes', async () => {
    routes.status = connectedStatus
    const wrapper = await mountAt('/settings/integrations')
    await vi.waitFor(() => expect(buttonNamed(wrapper, 'Scan now')).toBeDefined())
    useFakeClock()

    await buttonNamed(wrapper, 'Scan now')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Scanning Plex…'))
    expect(routes.queued).toEqual(['scan'])
    const callsWhenQueued = routes.statusCalls

    await vi.advanceTimersByTimeAsync(5000)
    await vi.waitFor(() => expect(routes.statusCalls).toBe(callsWhenQueued + 1))
    expect(wrapper.text()).toContain('Scanning Plex…')

    routes.status = { ...connectedStatus, lastScanAt: '2026-11-21T10:05:00.000Z' }
    await vi.advanceTimersByTimeAsync(5000)
    await vi.waitFor(() => expect(wrapper.text()).not.toContain('Scanning Plex…'))
    const callsWhenFinished = routes.statusCalls

    await vi.advanceTimersByTimeAsync(30_000)
    expect(routes.statusCalls).toBe(callsWhenFinished)
  })

  it('alerts when the first status load fails', async () => {
    routes.statusFails = true
    const wrapper = await mountAt('/settings/integrations')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Couldn\'t load the Plex connection'))
  })

  it('keeps the cards without the load alert when a status refresh during a scan fails', async () => {
    routes.status = connectedStatus
    const wrapper = await mountAt('/settings/integrations')
    await vi.waitFor(() => expect(buttonNamed(wrapper, 'Scan now')).toBeDefined())
    useFakeClock()

    await buttonNamed(wrapper, 'Scan now')!.trigger('click')
    routes.statusFails = true
    const callsWhenQueued = routes.statusCalls
    await vi.advanceTimersByTimeAsync(5000)
    await vi.waitFor(() => expect(routes.statusCalls).toBeGreaterThan(callsWhenQueued))
    await vi.advanceTimersByTimeAsync(0)

    expect(wrapper.text()).not.toContain('Couldn\'t load the Plex connection')
    expect(wrapper.text()).toContain('PlexMediaVault')
  })

  it('stops waiting for a reconcile after 3 minutes', async () => {
    routes.status = connectedStatus
    const wrapper = await mountAt('/settings/integrations')
    await vi.waitFor(() => expect(buttonNamed(wrapper, 'Re-run reconcile')).toBeDefined())
    useFakeClock()

    await buttonNamed(wrapper, 'Re-run reconcile')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Reconciling with Plex…'))

    vi.setSystemTime(Date.now() + 3 * 60 * 1000)
    await vi.advanceTimersByTimeAsync(5000)
    await vi.waitFor(() => expect(wrapper.text()).not.toContain('Reconciling with Plex…'))
    const callsAtTimeout = routes.statusCalls

    await vi.advanceTimersByTimeAsync(30_000)
    expect(routes.statusCalls).toBe(callsAtTimeout)
  })

  it('stops refreshing the status once the page is left', async () => {
    routes.status = connectedStatus
    const wrapper = await mountAt('/settings/integrations')
    await vi.waitFor(() => expect(buttonNamed(wrapper, 'Scan now')).toBeDefined())
    useFakeClock()
    await buttonNamed(wrapper, 'Scan now')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Scanning Plex…'))
    const callsWhenQueued = routes.statusCalls

    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(routes.statusCalls).toBe(callsWhenQueued)
  })

  it('disconnects after confirming and returns focus to sign-in', async () => {
    routes.status = connectedStatus
    const wrapper = await mountAt('/settings/integrations')
    await vi.waitFor(() => expect(buttonNamed(wrapper, 'Disconnect')).toBeDefined())

    await buttonNamed(wrapper, 'Disconnect')!.trigger('click')
    const confirmButton = await vi.waitFor(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(candidate => candidate.textContent?.trim() === 'Disconnect')
      expect(button).toBeDefined()
      return button!
    })
    expect(routes.disconnects).toBe(0)
    confirmButton.click()

    await vi.waitFor(() => expect(buttonNamed(wrapper, 'Sign in with Plex')).toBeDefined())
    expect(routes.disconnects).toBe(1)
    await vi.waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe('Sign in with Plex'))
  })
})
