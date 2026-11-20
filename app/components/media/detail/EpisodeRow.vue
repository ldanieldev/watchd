<script setup lang="ts">
import type { Title } from '~/utils/library/types'
import type { EpisodeRow } from '~/utils/library/detail'
import type { EpisodeDetail } from '~/utils/library/details'
import { episodeCode } from '~/utils/library/derive'
import { parseIsoDate, relativeDay } from '~/utils/library/dates'
import { tmdbImage } from '~/utils/library/tmdb'

const props = defineProps<{
  title: Title
  row: EpisodeRow
  detail?: EpisodeDetail
  today: Date
}>()

const emit = defineEmits<{ mark: [], markThrough: [], unmark: [] }>()

const shortDateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
const fullDateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })

const code = computed(() => episodeCode(props.title, props.row.episode))
const displayName = computed(() => props.detail?.name ?? `Episode ${props.row.episode.number}`)
const stillPath = computed(() => props.detail?.stillPath ?? props.title.backdropPath)

const watchedLabel = computed(() => {
  const [newest] = props.row.watchDates
  if (!newest) return ''
  const count = props.row.watchDates.length
  return count === 1
    ? `Watched ${fullDateFormat.format(parseIsoDate(newest))}`
    : `Watched ${count}×, last ${shortDateFormat.format(parseIsoDate(newest))}`
})

const airLabel = computed(() => {
  const airDate = fullDateFormat.format(parseIsoDate(props.row.episode.airDate))
  return props.row.state === 'upcoming' ? `Airs ${relativeDay(props.row.episode.airDate, props.today)} · ${airDate}` : airDate
})
</script>

<template>
  <li
    data-episode-row
    class="episode-row flex flex-wrap items-start gap-x-4 gap-y-3 px-3 py-3 sm:flex-nowrap"
    :class="{
      'border-l-4 border-primary bg-primary/10': row.state === 'missing',
      'border-l-4 border-transparent': row.state !== 'missing'
    }"
  >
    <div
      class="aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-elevated ring-1 ring-default/50 sm:w-40"
      :class="{ 'opacity-60': row.state === 'upcoming' }"
    >
      <img
        v-if="stillPath"
        :src="tmdbImage(stillPath, 'w300')"
        alt=""
        loading="lazy"
        decoding="async"
        class="size-full object-cover"
      >
    </div>
    <div class="flex min-w-0 flex-1 basis-56 flex-col gap-1">
      <p class="flex items-baseline gap-2">
        <span class="shrink-0 text-sm font-semibold text-muted tabular-nums">{{ code }}</span>
        <span class="truncate font-medium text-highlighted">{{ displayName }}</span>
      </p>
      <p class="flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
        <span>{{ airLabel }}</span>
        <span v-if="detail?.runtimeMinutes">{{ detail.runtimeMinutes }} min</span>
      </p>
      <p
        v-if="detail?.overview"
        class="line-clamp-2 max-w-prose text-sm text-toned"
      >
        {{ detail.overview }}
      </p>
    </div>
    <div
      v-if="row.state !== 'upcoming'"
      class="flex w-full shrink-0 flex-col items-start gap-2 sm:w-52 sm:items-end"
    >
      <template v-if="row.state === 'watched'">
        <p class="flex items-center gap-1.5 text-sm font-medium text-primary">
          <UIcon
            name="i-lucide-check"
            class="size-4"
          />
          {{ watchedLabel }}
        </p>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-undo-2"
          @click="emit('unmark')"
        >
          Unmark<span class="sr-only"> {{ code }}</span>
        </UButton>
      </template>
      <div
        v-else
        class="flex flex-wrap gap-2 sm:justify-end"
      >
        <UButton
          size="xs"
          icon="i-lucide-check"
          @click="emit('mark')"
        >
          Mark watched<span class="sr-only"> {{ code }}</span>
        </UButton>
        <UButton
          v-if="row.episode.season !== 0"
          color="neutral"
          variant="outline"
          size="xs"
          icon="i-lucide-check-check"
          @click="emit('markThrough')"
        >
          Mark watched through here<span class="sr-only"> {{ code }}</span>
        </UButton>
      </div>
    </div>
  </li>
</template>

<style scoped>
.episode-row {
  content-visibility: auto;
  contain-intrinsic-size: auto none auto 6.5rem;
}
</style>
