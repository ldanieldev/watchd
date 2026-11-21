import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { createError } from 'h3'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import ImportPage from '~/pages/settings/import.vue'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))
enableAutoUnmount(afterEach)

const ImportInApp = defineComponent({ render: () => h(UApp, null, { default: () => h(ImportPage) }) })

function givenStatus(status: { total: number, pending: number, ready: number, failed: number }) {
  registerEndpoint('/api/import/status', { handler: () => status })
}

async function chooseFile(wrapper: VueWrapper, cardLabel: string, file: File) {
  const card = wrapper.findAll('section').find(section => section.find('h2').text() === cardLabel)!
  const input = card.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  return card
}

describe('import data page', () => {
  beforeEach(() => {
    // FileUpload previews via URL.createObjectURL, whose Node version rejects happy-dom's File; return a fake preview URL instead.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads a Floppy export and shows what it added', async () => {
    givenStatus({ total: 0, pending: 0, ready: 0, failed: 0 })
    const uploads: string[] = []
    registerEndpoint('/api/import/floppy', { method: 'POST', once: true, handler: (event) => {
      uploads.push(event.method)
      return { added: 9, duplicates: 2, skipped: [{ line: 4, title: 'The Matrix', reason: 'no watch date' }], titlesQueued: 3 }
    } })
    const wrapper = await mountSuspended(ImportInApp, { route: '/settings/import' })

    const card = await chooseFile(wrapper, 'Floppy', new File(['row_type'], 'floppy.csv', { type: 'text/csv' }))
    await card.findAll('button').find(button => button.text() === 'Import plays')!.trigger('click')

    await vi.waitFor(() => expect(card.text()).toContain('Added 9'))
    expect(uploads).toEqual(['POST'])
    expect(card.text()).toContain('Already in watchd 2')
    expect(card.text()).toContain('Row 4: The Matrix (no watch date)')
  })

  it('shows the server\'s reason when a file is rejected', async () => {
    givenStatus({ total: 0, pending: 0, ready: 0, failed: 0 })
    registerEndpoint('/api/import/trakt', { method: 'POST', once: true, handler: () => {
      throw createError({ statusCode: 400, statusMessage: 'This doesn\'t look like a Trakt export.' })
    } })
    const wrapper = await mountSuspended(ImportInApp, { route: '/settings/import' })

    const card = await chooseFile(wrapper, 'Trakt', new File(['x'], 'floppy.csv'))
    await card.findAll('button').find(button => button.text() === 'Import plays')!.trigger('click')

    await vi.waitFor(() => expect(card.text()).toContain('This doesn\'t look like a Trakt export.'))
  })

  it('offers a retry only when some titles failed', async () => {
    givenStatus({ total: 10, pending: 0, ready: 10, failed: 0 })
    const clean = await mountSuspended(ImportInApp, { route: '/settings/import' })
    await vi.waitFor(() => expect(clean.text()).toContain('All 10 titles have details'))
    expect(clean.findAll('button').some(button => button.text() === 'Retry failed')).toBe(false)
    clean.unmount()

    givenStatus({ total: 10, pending: 0, ready: 8, failed: 2 })
    const failing = await mountSuspended(ImportInApp, { route: '/settings/import' })
    await vi.waitFor(() => expect(failing.findAll('button').some(button => button.text() === 'Retry failed')).toBe(true))
    expect(failing.text()).toContain('2 titles couldn\'t be fetched from TMDB')
  })

  it('reports enrichment progress while titles are pending', async () => {
    givenStatus({ total: 800, pending: 388, ready: 412, failed: 0 })
    const wrapper = await mountSuspended(ImportInApp, { route: '/settings/import' })

    await vi.waitFor(() => expect(wrapper.text()).toContain('412 of 800 titles have details'))
    expect(wrapper.find('progress').attributes()).toMatchObject({ max: '800', value: '412' })
  })
})
