<script setup lang="ts">
import type { Title, TitleSummary } from '~/utils/library/types'
import type { TitleDetail } from '~~/shared/types/library'
import type { Fact } from './FactsList.vue'
import { seasonName, seasonSummaries, titleGaps } from '~/utils/library/detail'
import { isSpecial } from '~/utils/library/derive'
import { relativeDay, toIsoDate } from '~/utils/library/dates'
import { mediaTypeStyles } from '~/utils/library/mediaTypes'
import { titlePath } from '~/utils/library/paths'

const props = defineProps<{
  title: Title
  summary: TitleSummary
  detail?: TitleDetail
}>()

const { data, today, markSeason, setTitleType } = useLibrary()
const { announceMarked } = useUndoToast()
const todayIso = computed(() => toIsoDate(today.value))

const gaps = computed(() => titleGaps(data.value, props.title.id, todayIso.value))
const seasons = computed(() => seasonSummaries(data.value, props.title.id, todayIso.value))
const regularEpisodes = computed(() => data.value.episodes.filter(episode => episode.titleId === props.title.id && !isSpecial(episode)))

const yearRange = computed(() => {
  const startYear = props.title.firstAired.slice(0, 4)
  const lastAirDate = regularEpisodes.value.map(episode => episode.airDate).sort().at(-1)
  const isStillAiring = lastAirDate === undefined || lastAirDate > todayIso.value || props.detail?.status === 'Returning Series'
  if (isStillAiring) return `${startYear}–`
  const endYear = lastAirDate.slice(0, 4)
  return endYear === startYear ? startYear : `${startYear}–${endYear}`
})

const progressLine = computed(() => {
  const { watchedCount, totalCount, lastWatchedAt } = props.summary
  const watchedPart = `${watchedCount} of ${totalCount} watched`
  return watchedCount > 0 && lastWatchedAt ? `${watchedPart} · last watched ${relativeDay(lastWatchedAt, today.value)}` : watchedPart
})

const typicalRuntimeMinutes = computed(() => {
  const runtimes = props.detail?.episodes.flatMap(episode => episode.runtimeMinutes ?? []) ?? []
  const countsByRuntime = Map.groupBy(runtimes, runtime => runtime)
  const mostCommon = [...countsByRuntime.entries()].sort(([, first], [, second]) => second.length - first.length)[0]?.[0]
  return mostCommon ?? props.title.runtimeMinutes
})

const facts = computed<Fact[]>(() => {
  const runtime = typicalRuntimeMinutes.value ? `${typicalRuntimeMinutes.value} min` : undefined
  if (!props.detail) {
    return [
      { label: 'First aired', value: props.title.firstAired.slice(0, 4) },
      { label: 'Runtime', value: runtime },
      { label: 'Type', value: mediaTypeStyles[props.title.type].label }
    ]
  }
  return [
    { label: 'Status', value: props.detail.status },
    { label: 'Network', value: props.detail.network },
    { label: 'Runtime', value: runtime },
    { label: 'Genres', value: props.detail.genres.join(', ') },
    { label: 'Rating', value: props.detail.voteAverage ? `TMDB ${props.detail.voteAverage.toFixed(1)}` : undefined }
  ]
})

const showApiError = useApiErrorToast()
const isMovingType = ref(false)
const otherType = computed(() => (props.title.type === 'anime' ? 'tv' : 'anime'))

async function onMoveType() {
  const typeOverride = otherType.value
  isMovingType.value = true
  try {
    await $fetch(`/api/library/titles/${props.title.id}/settings`, { method: 'PUT', body: { typeOverride } })
    setTitleType(props.title.id, typeOverride)
    await navigateTo(titlePath({ id: props.title.id, type: typeOverride }), { replace: true })
  } catch (error) {
    showApiError(error, `Couldn't move ${props.title.name}`, 'Try again in a moment.')
  } finally {
    isMovingType.value = false
  }
}

function onMarkSeason(season: number) {
  announceMarked(`Marked ${seasonName(season, props.detail?.seasons)} watched`, markSeason(props.title.id, season))
}
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col gap-10 overflow-y-auto p-4 sm:p-6 lg:p-8">
    <div class="flex flex-col gap-4">
      <MediaDetailHero :title="title">
        <template #facts>
          <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <MediaTypeTag :type="title.type" />
            <span class="tabular-nums">{{ yearRange }}</span>
            <span v-if="detail">{{ detail.status }}</span>
            <UButton
              size="xs"
              variant="link"
              color="neutral"
              :loading="isMovingType"
              @click="onMoveType"
            >
              Move to {{ mediaTypeStyles[otherType].label }}
            </UButton>
          </p>
          <p class="text-base font-medium text-highlighted tabular-nums">
            {{ progressLine }}
          </p>
        </template>
      </MediaDetailHero>
      <MediaDetailGapsPanel
        :title="title"
        :gaps="gaps"
        :not-started="summary.watchedCount === 0"
        :today="today"
      />
    </div>

    <MediaDetailSeasonList
      :title="title"
      :seasons="seasons"
      :season-details="detail?.seasons"
      @mark-season="onMarkSeason"
    />

    <section
      v-if="detail?.overview"
      class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12"
      aria-labelledby="about-title"
    >
      <div class="flex flex-col gap-3">
        <h2
          id="about-title"
          class="font-display text-xl font-bold text-highlighted"
        >
          About
        </h2>
        <p class="max-w-prose text-pretty text-default">
          {{ detail.overview }}
        </p>
      </div>
      <MediaDetailFactsList
        :facts="facts"
        class="lg:pt-10"
      />
    </section>
    <MediaDetailFactsList
      v-else
      :facts="facts"
    />

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
