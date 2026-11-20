<script setup lang="ts">
import type { WeekDay } from '~/utils/library/types'
import { episodeCode } from '~/utils/library/derive'
import { parseIsoDate } from '~/utils/library/dates'
import { tmdbImage } from '~/utils/library/tmdb'

const props = defineProps<{
  days: WeekDay[]
  overlay?: boolean
}>()

const track = useTemplateRef<HTMLElement>('track')

function weekdayLabel(day: WeekDay) {
  return day.isToday ? 'Today' : parseIsoDate(day.date).toLocaleString('en', { weekday: 'short' })
}

function fullDateLabel(day: WeekDay) {
  return parseIsoDate(day.date).toLocaleString('en', { weekday: 'long', month: 'long', day: 'numeric' })
}

onMounted(() => {
  const trackElement = track.value
  const todayIndex = props.days.findIndex(day => day.isToday)
  const todayElement = trackElement?.children[todayIndex] as HTMLElement | undefined
  if (trackElement && todayElement && trackElement.scrollWidth > trackElement.clientWidth) {
    trackElement.scrollLeft = todayElement.offsetLeft - trackElement.offsetLeft
  }
})
</script>

<template>
  <ol
    ref="track"
    class="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain md:grid md:grid-cols-7 md:overflow-visible"
    aria-label="This week"
  >
    <li
      v-for="day in days"
      :key="day.date"
      class="flex min-h-28 w-36 shrink-0 snap-start flex-col gap-2 rounded-lg p-2.5 md:w-auto"
      :class="[
        overlay ? 'bg-default/75 backdrop-blur-md' : 'bg-elevated',
        day.isPast && 'opacity-60',
        day.isToday && 'ring-2 ring-primary'
      ]"
      :aria-label="fullDateLabel(day)"
      :aria-current="day.isToday ? 'date' : undefined"
    >
      <div class="flex items-baseline justify-between gap-1">
        <span class="font-display text-xl font-bold leading-none text-highlighted">
          {{ parseIsoDate(day.date).getDate() }}
        </span>
        <span
          class="text-xs font-medium"
          :class="day.isToday ? 'text-primary' : 'text-muted'"
        >
          {{ weekdayLabel(day) }}
        </span>
      </div>
      <ul class="flex flex-col gap-1.5">
        <li
          v-for="release in day.releases"
          :key="`${release.title.id}-${release.episode?.id ?? 'movie'}`"
          class="flex items-center gap-1.5 text-xs leading-tight"
          :class="release.watched ? 'text-muted line-through' : 'text-default'"
        >
          <img
            :src="tmdbImage(release.title.posterPath, 'w92')"
            alt=""
            loading="lazy"
            class="h-7.5 w-5 shrink-0 rounded-sm object-cover"
          >
          <span class="min-w-0">
            <span class="line-clamp-1">{{ release.title.name }}</span>
            <span class="text-muted">{{ release.episode ? episodeCode(release.title, release.episode) : 'Release' }}</span>
          </span>
        </li>
      </ul>
    </li>
  </ol>
</template>
