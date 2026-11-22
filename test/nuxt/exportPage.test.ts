import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { createError } from 'h3'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import ExportPage from '~/pages/settings/export.vue'

enableAutoUnmount(afterEach)

const ExportInApp = defineComponent({ render: () => h(UApp, null, { default: () => h(ExportPage) }) })

describe('export data page', () => {
  it('shows what a backup will hold', async () => {
    registerEndpoint('/api/export/summary', () => ({ plays: 9154, titleSettings: 812 }))
    const wrapper = await mountSuspended(ExportInApp, { route: '/settings/export' })

    await vi.waitFor(() => expect(wrapper.text()).toContain('9,154 plays'))
    expect(wrapper.text()).toContain('812 title settings')
  })

  it('says the counts failed to load and keeps the download when the summary request fails', async () => {
    registerEndpoint('/api/export/summary', () => {
      throw createError({ statusCode: 500, statusMessage: 'boom' })
    })
    const wrapper = await mountSuspended(ExportInApp, { route: '/settings/export' })

    await vi.waitFor(() => expect(wrapper.text()).toContain('Couldn\'t load the counts. The download still works.'))
    expect(wrapper.text()).not.toContain('title settings')
    expect(wrapper.findAll('a').some(anchor => anchor.text() === 'Download backup')).toBe(true)
  })

  it('downloads through a plain link to the export route', async () => {
    registerEndpoint('/api/export/summary', () => ({ plays: 1, titleSettings: 0 }))
    const wrapper = await mountSuspended(ExportInApp, { route: '/settings/export' })

    const link = wrapper.findAll('a').find(anchor => anchor.text() === 'Download backup')!
    expect(link.attributes('href')).toBe('/api/export')
    expect(link.attributes()).toHaveProperty('download')
  })

  it('shows a bearer-token script example that points to Advanced', async () => {
    registerEndpoint('/api/export/summary', () => ({ plays: 1, titleSettings: 0 }))
    const wrapper = await mountSuspended(ExportInApp, { route: '/settings/export' })

    expect(wrapper.find('pre').text()).toContain('Authorization: Bearer')
    expect(wrapper.find('pre').text()).toContain('/api/export')
    expect(wrapper.findAll('a').some(anchor => anchor.attributes('href') === '/settings/advanced')).toBe(true)
  })
})
