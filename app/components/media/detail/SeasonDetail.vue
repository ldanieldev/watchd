<script setup lang="ts">
import type { Title } from '~~/shared/utils/library/types'
import { seasonEpisodeRows, seasonName, seasonSummaries } from '~~/shared/utils/library/detail'
import type { TitleDetail } from '~~/shared/types/library'
import { episodeCode } from '~~/shared/utils/library/derive'
import { toIsoDate } from '~~/shared/utils/library/dates'
import { seasonPath, titlePath } from '~/utils/library/paths'

const props = defineProps<{ title: Title, season: number, detail?: TitleDetail }>()

const { data, today, markWatched, markThrough, markSeason, unmarkEpisode, restoreWatches } = useLibrary()
const { showUndoToast, announceMarked } = useUndoToast()
const todayIso = computed(() => toIsoDate(today.value))

const detail = computed(() => props.detail)
const rows = computed(() => seasonEpisodeRows(data.value, props.title.id, props.season, todayIso.value))
const summaries = computed(() => seasonSummaries(data.value, props.title.id, todayIso.value))
const summary = computed(() => summaries.value.find(candidate => candidate.season === props.season))

const { renderedCount: renderedEpisodeCount, renderMore: renderMoreEpisodes, reset: resetEpisodeBatches } = useRenderBatches(50, 'loadMoreButton')
const renderedRows = computed(() => rows.value.slice(0, renderedEpisodeCount.value))
const remainingEpisodeCount = computed(() => rows.value.length - renderedRows.value.length)
watch(() => props.season, resetEpisodeBatches)

const seasonNumbers = computed(() => summaries.value.map(candidate => candidate.season))
const seasonIndex = computed(() => seasonNumbers.value.indexOf(props.season))
const previousSeason = computed(() => seasonNumbers.value[seasonIndex.value - 1])
const nextSeason = computed(() => seasonNumbers.value[seasonIndex.value + 1])

const progressLabel = computed(() => {
  if (!summary.value) return ''
  const { watchedCount, airedCount, upcomingCount } = summary.value
  const upcomingPart = upcomingCount > 0 ? ` · ${upcomingCount} upcoming` : ''
  return `${watchedCount} of ${airedCount} aired watched${upcomingPart}`
})

function episodeDetailOf(season: number, number: number) {
  return props.detail?.episodes.find(episode => episode.season === season && episode.number === number)
}

function onMarkSeason() {
  announceMarked(`Marked ${seasonName(props.season, detail.value?.seasons)} watched`, markSeason(props.title.id, props.season))
}

function onMarkThrough(episodeId: string, code: string) {
  announceMarked(`Marked watched through ${code}`, markThrough(props.title.id, episodeId))
}

function onUnmark(episodeId: string, code: string) {
  const removed = unmarkEpisode(episodeId)
  if (removed.length > 0) showUndoToast(`Unmarked ${code}`, () => restoreWatches(removed))
}
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col gap-10 overflow-y-auto p-4 sm:p-6 lg:p-8">
    <section
      class="flex flex-col gap-4"
      aria-labelledby="season-title"
    >
      <NuxtLink
        :to="titlePath(title)"
        class="flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-4"
        />
        {{ title.name }}
      </NuxtLink>
      <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div class="flex min-w-0 flex-col gap-2">
          <h1
            id="season-title"
            class="font-display text-4xl font-extrabold leading-none tracking-tight text-highlighted text-balance sm:text-5xl"
          >
            {{ seasonName(season, detail?.seasons) }}
          </h1>
          <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-toned">
            <MediaTypeTag :type="title.type" />
            <span class="font-medium text-highlighted tabular-nums">{{ progressLabel }}</span>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-if="previousSeason !== undefined"
            :to="seasonPath(title, previousSeason)"
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-chevron-left"
          >
            {{ seasonName(previousSeason, detail?.seasons) }}
          </UButton>
          <UButton
            v-if="nextSeason !== undefined"
            :to="seasonPath(title, nextSeason)"
            color="neutral"
            variant="ghost"
            size="sm"
            trailing-icon="i-lucide-chevron-right"
          >
            {{ seasonName(nextSeason, detail?.seasons) }}
          </UButton>
          <UButton
            v-if="summary && summary.missingCount > 0"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-check-check"
            class="rounded-full"
            @click="onMarkSeason"
          >
            Mark season watched
          </UButton>
        </div>
      </div>
    </section>

    <ul
      aria-label="Episodes"
      class="flex flex-col divide-y divide-default border-y border-default"
    >
      <MediaDetailEpisodeRow
        v-for="row in renderedRows"
        :key="row.episode.id"
        :title="title"
        :row="row"
        :detail="episodeDetailOf(row.episode.season, row.episode.number)"
        :today="today"
        @mark="markWatched(title.id, row.episode.id)"
        @mark-through="onMarkThrough(row.episode.id, episodeCode(title, row.episode))"
        @unmark="onUnmark(row.episode.id, episodeCode(title, row.episode))"
      />
    </ul>
    <UButton
      v-if="remainingEpisodeCount > 0"
      ref="loadMoreButton"
      :key="renderedEpisodeCount"
      color="neutral"
      variant="outline"
      size="sm"
      class="-mt-6 self-center rounded-full"
      @click="renderMoreEpisodes"
    >
      Show more episodes ({{ remainingEpisodeCount }} left)
    </UButton>

    <MediaDetailPeopleShelf
      v-if="detail"
      heading="Cast"
      :people="detail.cast"
    />
    <MediaDetailPeopleShelf
      v-if="detail"
      heading="Crew"
      :people="detail.crew"
    />
  </main>
</template>
