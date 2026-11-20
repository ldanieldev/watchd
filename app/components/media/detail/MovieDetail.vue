<script setup lang="ts">
import type { Title, TitleSummary } from '~/utils/library/types'
import type { TitleDetail } from '~/utils/library/details'
import type { Fact } from './FactsList.vue'
import { collectionMembers, movieWatches } from '~/utils/library/detail'
import { parseIsoDate, toIsoDate } from '~/utils/library/dates'
import { mediaTypeStyles } from '~/utils/library/mediaTypes'

const props = defineProps<{
  title: Title
  summary: TitleSummary
  detail?: TitleDetail
}>()

const { data, today, addMovieWatch, removeWatch, restoreWatches } = useLibrary()
const { showUndoToast } = useUndoToast()
const todayIso = toIsoDate(today)
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const watches = computed(() => movieWatches(data.value, props.title.id))
const members = computed(() => props.detail?.collection ? collectionMembers(data.value, props.detail.collection.memberTmdbIds, todayIso) : [])

const watchSummary = computed(() => {
  const { timesWatched, lastWatchedAt, minutesLeft } = props.summary
  const runtime = props.title.runtimeMinutes
  if (minutesLeft !== undefined && runtime) return `${runtime - minutesLeft} of ${runtime} min`
  if (timesWatched === 0 || !lastWatchedAt) return 'Not watched'
  return `Watched ${timesWatched}× · last ${dateFormatter.format(parseIsoDate(lastWatchedAt))}`
})

const releaseYear = computed(() => props.title.firstAired.slice(0, 4))
const runtimeLabel = computed(() => props.title.runtimeMinutes ? `${props.title.runtimeMinutes} min` : undefined)

const facts = computed<Fact[]>(() => {
  const releaseDate = dateFormatter.format(parseIsoDate(props.title.firstAired))
  if (!props.detail) {
    return [
      { label: 'Release date', value: releaseDate },
      { label: 'Runtime', value: runtimeLabel.value },
      { label: 'Type', value: mediaTypeStyles[props.title.type].label }
    ]
  }
  return [
    { label: 'Release date', value: releaseDate },
    { label: 'Status', value: props.detail.status },
    { label: 'Runtime', value: runtimeLabel.value },
    { label: 'Certification', value: props.detail.certification },
    { label: 'Studios', value: props.detail.studios.join(', ') },
    { label: 'Languages', value: props.detail.languages.join(', ') },
    { label: 'Rating', value: props.detail.voteAverage ? `TMDB ${props.detail.voteAverage.toFixed(1)}` : undefined }
  ]
})

function onAddWatch(dateIso: string) {
  const watchedAt = `${dateIso}T${new Date().toTimeString().slice(0, 8)}`
  addMovieWatch(props.title.id, watchedAt)
  showUndoToast(`Added watch on ${dateFormatter.format(parseIsoDate(dateIso))}`, () => removeWatch(props.title.id, watchedAt), { icon: 'i-lucide-check' })
}

function onRemoveWatch(watchedAt: string) {
  const removed = removeWatch(props.title.id, watchedAt)
  if (removed.length > 0) showUndoToast(`Removed watch from ${dateFormatter.format(parseIsoDate(watchedAt))}`, () => restoreWatches(removed))
}
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col gap-10 overflow-y-auto p-4 sm:p-6 lg:p-8">
    <MediaDetailHero :title="title">
      <template #facts>
        <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <MediaTypeTag :type="title.type" />
          <span class="tabular-nums">{{ releaseYear }}</span>
          <span
            v-if="runtimeLabel"
            class="tabular-nums"
          >{{ runtimeLabel }}</span>
          <span v-if="detail?.certification">{{ detail.certification }}</span>
        </p>
        <p class="text-base font-medium text-highlighted tabular-nums">
          {{ watchSummary }}
        </p>
      </template>
    </MediaDetailHero>

    <MediaDetailWatchHistory
      :watches="watches"
      :runtime-minutes="title.runtimeMinutes"
      :today-iso="todayIso"
      :can-add="title.firstAired <= todayIso"
      @add="onAddWatch"
      @remove="onRemoveWatch"
    />

    <MediaDetailCollectionRow
      v-if="detail?.collection"
      :name="detail.collection.name"
      :members="members"
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
