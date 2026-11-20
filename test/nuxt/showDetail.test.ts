import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ShowPage from '~/pages/tv/[id]/index.vue'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true) }))
enableAutoUnmount(afterEach)

describe('show detail page', () => {
  beforeEach(() => {
    clearNuxtState(['library', 'library-today'])
  })

  it('lists the mid-series gap with a link to its season page', async () => {
    const wrapper = await mountSuspended(ShowPage, { route: '/tv/tulsa-king' })
    const gapLink = wrapper.findAll('a').find(link => link.text().includes('S3 E7–E10'))

    expect(gapLink?.attributes('href')).toBe('/tv/tulsa-king/season/3')
    expect(wrapper.text()).toContain('S4E9 airs tomorrow')
    expect(wrapper.findAll('h2').map(heading => heading.text())).toEqual(expect.arrayContaining(['About', 'Cast', 'Crew']))
    expect(wrapper.find('a[href="/people/16483"]').text()).toContain('Sylvester Stallone')
  })

  it('puts the specials row last', async () => {
    const wrapper = await mountSuspended(ShowPage, { route: '/tv/tulsa-king' })
    const seasonRows = wrapper.findAll('[aria-label="Seasons"] > li')

    expect(seasonRows.length).toBe(5)
    expect(seasonRows.at(-1)!.text()).toContain('Specials')
  })

  it('renders a filler title without cast or crew shelves', async () => {
    const wrapper = await mountSuspended(ShowPage, { route: '/tv/arcane' })

    expect(wrapper.find('h1').text()).toBe('Arcane')
    const headings = wrapper.findAll('h2').map(heading => heading.text())
    expect(headings).not.toContain('About')
    expect(headings).not.toContain('Cast')
    expect(headings).not.toContain('Crew')
    expect(wrapper.find('dl').text()).toContain('First aired')
  })

  it('clears the gap after marking season 3 watched', async () => {
    const wrapper = await mountSuspended(ShowPage, { route: '/tv/tulsa-king' })
    const seasonThreeRow = wrapper.findAll('[aria-label="Seasons"] > li').find(row => row.text().includes('Season 3'))!
    const markButton = seasonThreeRow.findAll('button').find(button => button.text().startsWith('Mark season watched'))!

    await markButton.trigger('click')

    expect(wrapper.text()).not.toContain('S3 E7–E10')
  })
})
