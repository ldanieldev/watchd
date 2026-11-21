import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MediaPosterImage from '~/components/media/PosterImage.vue'
import type { Title } from '~~/shared/utils/library/types'

const title: Title = { id: 'dead', type: 'tv', name: 'Dead Poster Show', firstAired: '2026-01-01', posterPath: '/missing.jpg' }

describe('PosterImage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the fallback when the image already failed before mount', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0)

    const wrapper = await mountSuspended(MediaPosterImage, { props: { title } })
    await nextTick()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('Dead Poster Show')
  })
})
