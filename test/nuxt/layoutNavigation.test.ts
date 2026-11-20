import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import DefaultLayout from '~/layouts/default.vue'

mockNuxtImport('useUserSession', () => () => ({ loggedIn: ref(true), user: ref({ name: 'Test' }), clear: async () => {} }))

async function activeLabels(route: string) {
  const wrapper = await mountSuspended(DefaultLayout, { route })
  return wrapper.findAll('a[aria-current="page"]').map(link => link.text())
}

describe('default layout navigation', () => {
  it('highlights TV Shows on a show detail page', async () => {
    expect(await activeLabels('/tv/tulsa-king')).toContain('TV Shows')
  })

  it('highlights Movies and Anime on their detail pages', async () => {
    expect(await activeLabels('/movies/dune')).toContain('Movies')
    expect(await activeLabels('/anime/frieren-beyond-journey-s-end/season/1')).toContain('Anime')
  })

  it('does not highlight Home on a detail page', async () => {
    expect(await activeLabels('/tv/tulsa-king')).not.toContain('Home')
  })

  it('highlights History and Statistics on their pages', async () => {
    expect(await activeLabels('/history')).toContain('History')
    expect(await activeLabels('/stats')).toContain('Statistics')
  })
})
