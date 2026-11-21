<script setup lang="ts">
import type { TitleSummary } from '~~/shared/utils/library/types'
import type { HomeView } from '~~/shared/utils/library/views'
import type { ShelfItem } from '~/components/media/PosterShelf.vue'
import { episodeCode } from '~~/shared/utils/library/derive'
import { parseIsoDate, relativeDay } from '~~/shared/utils/library/dates'

const { data: home, refresh } = await useLibraryView<HomeView>('/api/library/views/home')
const todayIso = useLibraryToday()
const today = computed(() => parseIsoDate(todayIso.value))
const upNext = computed(() => home.value?.upNext)
const week = computed(() => home.value?.week ?? [])
const inProgress = computed(() => home.value?.inProgress ?? [])
const recent = computed(() => home.value?.recent ?? [])
const toast = useToast()
const showApiError = useApiErrorToast()

function formatMinutesLeft(minutes = 0) {
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}h ${minutes % 60}m left` : `${minutes}m left`
}

const continueItems = computed<ShelfItem[]>(() => inProgress.value.map(summary => ({
  key: summary.title.id,
  title: summary.title,
  progress: summary.progress,
  caption: summary.title.type === 'movie'
    ? formatMinutesLeft(summary.minutesLeft)
    : `${summary.watchedCount}/${summary.totalCount}`
})))

const recentItems = computed<ShelfItem[]>(() => recent.value.map(entry => ({
  key: `${entry.title.id}-${entry.watchedAt}`,
  title: entry.title,
  caption: entry.episode
    ? `${episodeCode(entry.title, entry.episode)}, ${relativeDay(entry.watchedAt, today.value)}`
    : relativeDay(entry.watchedAt, today.value)
})))

async function onMarkWatched(summary: TitleSummary) {
  const episode = summary.nextEpisode!
  try {
    await $fetch('/api/library/watches', { method: 'POST', body: { watches: [{ titleId: summary.title.id, episodeId: episode.id, watchedAt: new Date().toISOString() }] } })
  } catch (error) {
    showApiError(error, 'Couldn\'t save watch', 'The change was not saved. Try again.')
    return
  }
  toast.add({ title: `Marked ${episodeCode(summary.title, episode)} of ${summary.title.name} watched`, icon: 'i-lucide-check' })
  await refresh()
}
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col gap-10 overflow-y-auto p-4 sm:p-6 lg:p-8">
    <h1 class="sr-only">
      Home
    </h1>
    <MediaNowPlaying />
    <MediaHomeHero
      :up-next="upNext"
      :week="week"
      @mark-watched="onMarkWatched"
    />
    <MediaPosterShelf
      heading="Continue watching"
      :items="continueItems"
    />
    <MediaPosterShelf
      heading="Recently watched"
      :items="recentItems"
    />
  </main>
</template>
