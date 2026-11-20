<script setup lang="ts">
import type { Title } from '~/utils/library/types'
import type { EpisodeRange, TitleGaps } from '~/utils/library/detail'
import { episodeCode } from '~/utils/library/derive'
import { relativeDay } from '~/utils/library/dates'
import { seasonPath } from '~/utils/library/paths'

const props = defineProps<{
  title: Title
  gaps: TitleGaps
  notStarted: boolean
  today: Date
}>()

const hasGaps = computed(() => props.gaps.missingRanges.length > 0 || props.gaps.notStartedSeasons.length > 0)

function rangeLabel(range: EpisodeRange) {
  const seasonPrefix = props.title.type === 'anime' && range.season === 1 ? '' : `S${range.season} `
  return range.fromNumber === range.toNumber
    ? `${seasonPrefix}E${range.fromNumber}`
    : `${seasonPrefix}E${range.fromNumber}–E${range.toNumber}`
}

const upcomingLabel = computed(() => {
  const episode = props.gaps.nextUpcoming
  return episode ? `${episodeCode(props.title, episode)} airs ${relativeDay(episode.airDate, props.today)}` : undefined
})
</script>

<template>
  <section
    aria-label="Gaps"
    class="flex flex-col gap-2 text-sm"
    :class="hasGaps ? 'rounded-lg border-l-4 border-primary bg-primary/10 px-4 py-3' : 'px-1'"
  >
    <ul
      v-if="hasGaps"
      class="flex flex-wrap gap-x-5 gap-y-1.5"
    >
      <li
        v-for="range in gaps.missingRanges"
        :key="`${range.season}-${range.fromNumber}`"
      >
        <NuxtLink
          :to="seasonPath(title, range.season)"
          class="rounded-sm font-medium text-highlighted underline decoration-primary/50 underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span class="font-semibold text-primary">{{ rangeLabel(range) }}</span> unwatched
        </NuxtLink>
      </li>
      <li
        v-for="season in gaps.notStartedSeasons"
        :key="`not-started-${season}`"
      >
        <NuxtLink
          :to="seasonPath(title, season)"
          class="rounded-sm font-medium text-highlighted underline decoration-primary/50 underline-offset-4 hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span class="font-semibold text-primary">Season {{ season }}</span> not started
        </NuxtLink>
      </li>
    </ul>
    <p
      v-else
      class="flex items-center gap-1.5 text-muted"
    >
      <UIcon
        :name="notStarted ? 'i-lucide-circle-dashed' : 'i-lucide-circle-check'"
        class="size-4"
      />
      {{ notStarted ? 'Not started' : 'All caught up' }}
    </p>
    <p
      v-if="upcomingLabel"
      class="flex items-center gap-1.5 text-muted"
    >
      <UIcon
        name="i-lucide-calendar-clock"
        class="size-4"
      />
      {{ upcomingLabel }}
    </p>
  </section>
</template>
