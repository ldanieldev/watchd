<script setup lang="ts">
import { episodeCode } from '~~/shared/utils/library/derive'
import type { MediaType } from '~~/shared/utils/library/types'
import { titlePath } from '~/utils/library/paths'

interface NowPlayingItem {
  titleId: number
  type: MediaType
  name: string
  season?: number
  number?: number
}

const NOW_PLAYING_POLL_INTERVAL_MS = 15_000

const items = ref<NowPlayingItem[]>([])
let pollTimer: ReturnType<typeof setInterval> | undefined
let isMounted = false

async function refreshNowPlaying() {
  try {
    const response = await $fetch<{ items: NowPlayingItem[] }>('/api/plex/now-playing')
    if (isMounted) items.value = response.items
  } catch {
    if (isMounted) items.value = []
  }
}

function refreshWhenVisible() {
  if (document.visibilityState === 'visible') void refreshNowPlaying()
}

onMounted(() => {
  isMounted = true
  refreshWhenVisible()
  pollTimer = setInterval(refreshWhenVisible, NOW_PLAYING_POLL_INTERVAL_MS)
  document.addEventListener('visibilitychange', refreshWhenVisible)
})

onBeforeUnmount(() => {
  isMounted = false
  clearInterval(pollTimer)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
})

function label(item: NowPlayingItem) {
  if (item.season === undefined || item.number === undefined) return item.name
  return `${item.name} ${episodeCode(item, { season: item.season, number: item.number })}`
}
</script>

<template>
  <div
    v-if="items.length"
    class="-mb-6 flex flex-col gap-1 text-sm"
  >
    <p
      v-for="item in items"
      :key="`${item.titleId}-${item.season}-${item.number}`"
      class="flex min-w-0 items-center gap-2 text-muted"
    >
      <span
        class="size-2 shrink-0 rounded-full bg-primary motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <span
        :title="`Now playing — ${label(item)}`"
        class="min-w-0 truncate"
      >Now playing — <NuxtLink
        :to="titlePath({ id: String(item.titleId), type: item.type })"
        class="font-medium text-highlighted hover:underline focus-visible:underline"
      >{{ label(item) }}</NuxtLink></span>
    </p>
  </div>
</template>
