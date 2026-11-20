<script setup lang="ts">
import type { MediaType, TitleStatus, TitleSummary } from '~/utils/library/types'
import { groupByLetter, groupByPeriod } from '~/utils/library/derive'

const props = defineProps<{ type: MediaType }>()

type SortKey = 'lastWatched' | 'title' | 'releaseDate'

const pageTitles: Record<MediaType, { heading: string, noun: string }> = {
  movie: { heading: 'Movies', noun: 'movies' },
  tv: { heading: 'TV Shows', noun: 'shows' },
  anime: { heading: 'Anime', noun: 'series' }
}

const statusTabs: Record<MediaType, { value: TitleStatus | 'all', label: string }[]> = {
  movie: [
    { value: 'all', label: 'All' },
    { value: 'watching', label: 'In progress' },
    { value: 'completed', label: 'Watched' },
    { value: 'planned', label: 'Planned' }
  ],
  tv: [
    { value: 'all', label: 'All' },
    { value: 'watching', label: 'Watching' },
    { value: 'completed', label: 'Completed' },
    { value: 'planned', label: 'Planned' },
    { value: 'paused', label: 'Paused' },
    { value: 'dropped', label: 'Dropped' }
  ],
  anime: []
}
statusTabs.anime = statusTabs.tv

const sortOptions: { value: SortKey, label: string }[] = [
  { value: 'lastWatched', label: 'Last watched' },
  { value: 'title', label: 'Title' },
  { value: 'releaseDate', label: 'Release date' }
]

const { summaries, today } = useLibrary()
const activeStatus = ref<string>('all')
const sortKey = ref<SortKey>('lastWatched')

const ofType = computed(() => summaries.value.filter(summary => summary.title.type === props.type))

const tabs = computed(() => statusTabs[props.type].map(tab => ({
  ...tab,
  badge: { label: String(tab.value === 'all' ? ofType.value.length : ofType.value.filter(summary => summary.status === tab.value).length), variant: 'subtle' as const, color: 'neutral' as const }
})))

const groups = computed(() => {
  const visible = activeStatus.value === 'all' ? ofType.value : ofType.value.filter(summary => summary.status === activeStatus.value)
  if (sortKey.value === 'title') return groupByLetter(visible, summary => summary.title.name)
  if (sortKey.value === 'releaseDate') return groupByPeriod(visible, summary => summary.title.firstAired, today)
  return groupByPeriod(visible, summary => summary.lastWatchedAt, today)
})

function caption(summary: TitleSummary) {
  if (summary.title.type !== 'movie') return `${summary.watchedCount} of ${summary.totalCount}`
  if (summary.timesWatched > 1) return `Watched ${summary.timesWatched}×`
  return summary.title.firstAired.slice(0, 4)
}

function badge(summary: TitleSummary): { label: string, tone: 'primary' | 'neutral' } | undefined {
  if (summary.status === 'watching' && summary.newCount > 0) return { label: `${summary.newCount} new`, tone: 'primary' }
  if (summary.status === 'completed' && summary.title.type !== 'movie') return { label: 'Completed', tone: 'neutral' }
  return undefined
}

useHead({ title: pageTitles[props.type].heading })
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6 lg:p-8">
    <header class="flex items-baseline gap-3">
      <h1 class="font-display text-4xl font-extrabold tracking-tight text-highlighted">
        {{ pageTitles[type].heading }}
      </h1>
      <span class="text-sm text-muted">{{ ofType.length }} {{ pageTitles[type].noun }}</span>
    </header>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="max-w-full overflow-x-auto overscroll-x-contain">
        <UTabs
          v-model="activeStatus"
          :items="tabs"
          :content="false"
          color="neutral"
          size="sm"
          :ui="{ list: 'w-max', trigger: 'flex-none' }"
        />
      </div>
      <USelect
        v-model="sortKey"
        :items="sortOptions"
        aria-label="Sort by"
        variant="soft"
        class="w-40"
      />
    </div>

    <p
      v-if="!groups.length"
      class="py-16 text-center text-muted"
    >
      Nothing here yet.
    </p>

    <section
      v-for="group in groups"
      :key="group.label"
      class="flex flex-col gap-4"
    >
      <h2 class="flex items-baseline gap-2 font-display text-xl font-bold text-highlighted">
        {{ group.label }}
        <span class="font-sans text-xs font-medium text-muted">{{ group.items.length }}</span>
      </h2>
      <ul class="grid grid-cols-2 gap-x-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-y-6">
        <li
          v-for="summary in group.items"
          :key="summary.title.id"
        >
          <MediaPosterImage
            :title="summary.title"
            :progress="summary.progress"
            :badge="badge(summary)?.label"
            :badge-tone="badge(summary)?.tone"
          />
          <p class="mt-2 line-clamp-1 text-sm font-medium text-highlighted">
            {{ summary.title.name }}
          </p>
          <p class="text-xs text-muted">
            {{ caption(summary) }}
          </p>
        </li>
      </ul>
    </section>
  </main>
</template>
