import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import AdvancedPage from '~/pages/settings/advanced.vue'
import type { AccessTokenSummary } from '~~/shared/types/accessTokens'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))
enableAutoUnmount(afterEach)

const AdvancedInApp = defineComponent({ render: () => h(UApp, null, { default: () => h(AdvancedPage) }) })

const fullToken = 'wd_3fK9aaaaBBBBccccDDDDeeeeFFFFggggHHHHiiiiJJJ'

const routes = {
  tokens: [] as AccessTokenSummary[],
  posted: [] as unknown[],
  postFailure: undefined as { statusCode: number, statusMessage: string } | undefined,
  deleted: [] as string[],
  releaseDelete: undefined as (() => void) | undefined
}

registerEndpoint('/api/tokens', {
  method: 'GET',
  handler: () => routes.tokens
})
registerEndpoint('/api/tokens', {
  method: 'POST',
  handler: async (event) => {
    routes.posted.push(await readBody(event))
    if (routes.postFailure) throw createError(routes.postFailure)
    const created = { id: 9, name: 'nightly', prefix: fullToken.slice(3, 11), createdAt: '2026-11-21T10:00:00.000Z', lastUsedAt: null }
    routes.tokens = [created]
    return { ...created, token: fullToken }
  }
})
registerEndpoint('/api/tokens/1', {
  method: 'DELETE',
  handler: async (event) => {
    routes.deleted.push(event.path)
    await new Promise<void>((resolve) => {
      routes.releaseDelete = resolve
    })
    routes.tokens = []
    return { ok: true }
  }
})

const mountAdvanced = () => mountSuspended(AdvancedInApp, { route: '/settings/advanced', attachTo: document.body })
const buttonNamed = (wrapper: VueWrapper, label: string) => wrapper.findAll('button').find(button => button.text() === label)

describe('advanced page access tokens', () => {
  beforeEach(() => {
    routes.tokens = []
    routes.posted = []
    routes.postFailure = undefined
    routes.deleted = []
    routes.releaseDelete = undefined
  })

  it('lists each token with its name, prefix and last use', async () => {
    routes.tokens = [
      { id: 1, name: 'backup-script', prefix: '3fK9abcd', createdAt: '2026-11-01T10:00:00.000Z', lastUsedAt: new Date(Date.now() - 2 * 3_600_000).toISOString() },
      { id: 2, name: 'idle', prefix: 'zzzz1111', createdAt: '2026-11-02T10:00:00.000Z', lastUsedAt: null }
    ]
    const wrapper = await mountAdvanced()

    await vi.waitFor(() => expect(wrapper.text()).toContain('backup-script'))
    expect(wrapper.text()).toContain('wd_3fK9abcd…')
    expect(wrapper.text()).toContain('2 hours ago')
    expect(wrapper.text()).toContain('idle')
    expect(wrapper.text()).toContain('wd_zzzz1111…')
    expect(wrapper.text()).toContain('Never used')
  })

  it('formats the last-used tooltip in the viewer time zone', async () => {
    useState('library-time-zone').value = 'Pacific/Auckland'
    routes.tokens = [{ id: 1, name: 'backup-script', prefix: '3fK9abcd', createdAt: '2026-11-01T10:00:00.000Z', lastUsedAt: '2026-11-21T10:00:00.000Z' }]
    const wrapper = await mountAdvanced()

    await vi.waitFor(() => expect(wrapper.text()).toContain('backup-script'))
    expect(wrapper.find('[title*="Nov 21, 2026"]').attributes('title')).toContain('11:00 PM')
  })

  it('creates a token, reveals it once with a copy button and drops the reveal on dismiss', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const wrapper = await mountAdvanced()

    await wrapper.find('input[name="name"]').setValue('nightly')
    await buttonNamed(wrapper, 'Create token')!.trigger('click')

    await vi.waitFor(() => expect(wrapper.text()).toContain(fullToken))
    expect(routes.posted).toEqual([{ name: 'nightly' }])
    await vi.waitFor(() => expect(wrapper.text()).toContain('wd_3fK9aaaa…'))

    await buttonNamed(wrapper, 'Copy token')!.trigger('click')
    expect(writeText).toHaveBeenCalledWith(fullToken)

    await buttonNamed(wrapper, 'Done')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).not.toContain(fullToken))
    expect(wrapper.text()).toContain('wd_3fK9aaaa…')
    vi.unstubAllGlobals()
  })

  it('toasts a hand-copy hint when the clipboard write fails', async () => {
    useToast().clear()
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    const wrapper = await mountAdvanced()
    await wrapper.find('input[name="name"]').setValue('nightly')
    await buttonNamed(wrapper, 'Create token')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain(fullToken))

    await buttonNamed(wrapper, 'Copy token')!.trigger('click')

    await vi.waitFor(() => expect(document.body.textContent).toContain('Couldn\'t copy'))
    expect(document.body.textContent).toContain('Select the token and copy it by hand.')
    expect(document.body.textContent).not.toContain('Token copied')
    vi.unstubAllGlobals()
  })

  it('keeps Create token disabled while the name is blank or only spaces', async () => {
    const wrapper = await mountAdvanced()
    const createButton = () => buttonNamed(wrapper, 'Create token')!

    expect(createButton().attributes()).toHaveProperty('disabled')
    await wrapper.find('input[name="name"]').setValue('   ')
    expect(createButton().attributes()).toHaveProperty('disabled')
    await wrapper.find('input[name="name"]').setValue('nightly')
    expect(createButton().attributes()).not.toHaveProperty('disabled')
  })

  it('shows the server message on the name field when the name is taken', async () => {
    routes.postFailure = { statusCode: 409, statusMessage: 'A token with that name already exists.' }
    const wrapper = await mountAdvanced()

    await wrapper.find('input[name="name"]').setValue('nightly')
    await buttonNamed(wrapper, 'Create token')!.trigger('click')

    await vi.waitFor(() => expect(wrapper.text()).toContain('A token with that name already exists.'))
    expect(wrapper.find('input[name="name"]').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).not.toContain('wd_')
  })

  it('asks before revoking and removes the row only once the delete resolves', async () => {
    routes.tokens = [{ id: 1, name: 'backup-script', prefix: '3fK9abcd', createdAt: '2026-11-01T10:00:00.000Z', lastUsedAt: null }]
    const wrapper = await mountAdvanced()
    await vi.waitFor(() => expect(wrapper.text()).toContain('backup-script'))

    await buttonNamed(wrapper, 'Revoke')!.trigger('click')
    const confirmButton = await vi.waitFor(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(candidate => candidate.textContent?.trim() === 'Revoke token')
      expect(button).toBeDefined()
      return button!
    })
    expect(routes.deleted).toEqual([])

    confirmButton.click()
    await vi.waitFor(() => expect(routes.deleted).toHaveLength(1))
    expect(wrapper.text()).toContain('backup-script')

    routes.releaseDelete!()
    await vi.waitFor(() => expect(wrapper.text()).not.toContain('backup-script'))
  })
})
