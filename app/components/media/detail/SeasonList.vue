<script setup lang="ts">
import type { Title } from '~~/shared/utils/library/types'
import type { SeasonSummary } from '~~/shared/utils/library/detail'
import type { SeasonDetail } from '~~/shared/types/library'
import { seasonName } from '~~/shared/utils/library/detail'
import { seasonPath } from '~/utils/library/paths'
import { tmdbImage } from '~/utils/library/tmdb'

const props = defineProps<{
  title: Title
  seasons: SeasonSummary[]
  seasonDetails?: SeasonDetail[]
}>()

const emit = defineEmits<{ markSeason: [season: number] }>()

function seasonDetailOf(season: number) {
  return props.seasonDetails?.find(detail => detail.season === season)
}

function thumbnailPath(summary: SeasonSummary) {
  return seasonDetailOf(summary.season)?.posterPath ?? props.title.posterPath
}
</script>

<template>
  <section
    class="flex flex-col gap-3"
    aria-labelledby="season-list-title"
  >
    <h2
      id="season-list-title"
      class="font-display text-xl font-bold text-highlighted"
    >
      Seasons
    </h2>
    <ul
      aria-label="Seasons"
      class="flex flex-col divide-y divide-default border-y border-default"
    >
      <li
        v-for="summary in seasons"
        :key="summary.season"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
      >
        <NuxtLink
          :to="seasonPath(title, summary.season)"
          class="group flex min-w-0 flex-1 basis-64 items-center gap-4 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <img
            width="92"
            height="138"
            :src="tmdbImage(thumbnailPath(summary), 'w92')"
            alt=""
            loading="lazy"
            decoding="async"
            class="aspect-[2/3] w-12 shrink-0 rounded bg-elevated object-cover ring-1 ring-default/50"
            :class="{ 'opacity-70': summary.isSpecials }"
          >
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <p class="flex items-center gap-2">
              <span
                class="truncate font-medium group-hover:text-primary"
                :class="summary.isSpecials ? 'text-muted' : 'text-highlighted'"
              >{{ seasonName(summary.season, seasonDetails) }}</span>
              <span
                v-if="summary.complete && summary.watchedCount > 0"
                class="flex shrink-0 items-center text-primary"
              >
                <UIcon
                  name="i-lucide-check"
                  class="size-4"
                />
                <span class="sr-only">Complete</span>
              </span>
            </p>
            <UProgress
              :model-value="summary.watchedCount"
              :max="Math.max(summary.airedCount, 1)"
              :color="summary.isSpecials ? 'neutral' : 'primary'"
              size="xs"
              class="max-w-md"
              :get-value-label="(value: number | null | undefined) => `${value ?? 0} of ${summary.airedCount} aired episodes watched`"
            />
            <p class="flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
              <span>{{ summary.watchedCount }}/{{ summary.airedCount }}</span>
              <span
                v-if="summary.missingCount > 0"
                class="font-semibold"
                :class="summary.isSpecials ? 'text-toned' : 'text-primary'"
              >{{ summary.missingCount }} missing</span>
              <span v-if="summary.upcomingCount > 0">{{ summary.upcomingCount }} upcoming</span>
            </p>
          </div>
        </NuxtLink>
        <UButton
          v-if="summary.missingCount > 0"
          icon="i-lucide-check-check"
          color="neutral"
          variant="outline"
          size="sm"
          class="ml-16 rounded-full sm:ml-0"
          @click="emit('markSeason', summary.season)"
        >
          Mark season watched<span class="sr-only">: {{ seasonName(summary.season, seasonDetails) }}</span>
        </UButton>
      </li>
    </ul>
  </section>
</template>
