<script setup lang="ts">
import type { TitleSummary } from '~/utils/library/types'
import type { ShelfItem } from '~/components/media/PosterShelf.vue'
import { episodeCode } from '~/utils/library/derive'
import { relativeDay } from '~/utils/library/dates'

const { upNext, week, inProgress, recent, today, markWatched } = useLibrary()
const toast = useToast()

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
    ? `${episodeCode(entry.title, entry.episode)}, ${relativeDay(entry.watchedAt, today)}`
    : relativeDay(entry.watchedAt, today)
})))

function onMarkWatched(summary: TitleSummary) {
  const episode = summary.nextEpisode!
  markWatched(summary.title.id, episode.id)
  toast.add({ title: `Marked ${episodeCode(summary.title, episode)} of ${summary.title.name} watched`, icon: 'i-lucide-check' })
}
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col gap-10 overflow-y-auto p-4 sm:p-6 lg:p-8">
    <h1 class="sr-only">
      Home
    </h1>
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
