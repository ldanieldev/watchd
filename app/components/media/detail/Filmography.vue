<script setup lang="ts">
import type { FilmographyCredit } from '~/utils/library/details'
import type { Title } from '~/utils/library/types'
import { titlePath } from '~/utils/library/paths'
import { tmdbPageUrl } from '~/utils/library/tmdb'

const props = defineProps<{ credits: FilmographyCredit[] }>()

type FilmographyFilter = 'all' | 'movie' | 'tv'

const { data } = useLibrary()
const activeFilter = ref<FilmographyFilter>('all')
const collapsedRowCount = 2
const filmographyExpanded = ref(false)
const gridColumnCount = ref(4)
const filmographyGrid = useTemplateRef<HTMLElement>('filmographyGrid')
let gridResizeObserver: ResizeObserver | undefined

function measureGridColumns() {
  if (!filmographyGrid.value) return
  const measuredColumns = getComputedStyle(filmographyGrid.value).gridTemplateColumns.split(' ').filter(Boolean).length
  if (measuredColumns > 0) gridColumnCount.value = measuredColumns
}

onMounted(() => {
  measureGridColumns()
  if (!filmographyGrid.value) return
  gridResizeObserver = new ResizeObserver(measureGridColumns)
  gridResizeObserver.observe(filmographyGrid.value)
})
onBeforeUnmount(() => gridResizeObserver?.disconnect())

const filterTabs = computed(() => ([
  { value: 'all', label: 'All', count: props.credits.length },
  { value: 'movie', label: 'Movies', count: props.credits.filter(credit => credit.mediaType === 'movie').length },
  { value: 'tv', label: 'TV', count: props.credits.filter(credit => credit.mediaType === 'tv').length }
] as const).map(tab => ({
  value: tab.value,
  label: tab.label,
  badge: { label: String(tab.count), variant: 'subtle' as const, color: 'neutral' as const }
})))

const watchedTitleIds = computed(() => new Set(data.value.watches.map(watch => watch.titleId)))

const filmographyCards = computed(() => props.credits
  .filter(credit => activeFilter.value === 'all' || credit.mediaType === activeFilter.value)
  .toSorted((first, second) => (second.year ?? 0) - (first.year ?? 0))
  .map((credit) => {
    const libraryTitle = data.value.titles.find(candidate =>
      candidate.tmdbId === credit.tmdbId && (candidate.type === 'movie' ? 'movie' : 'tv') === credit.mediaType)
    const posterTitle: Title = libraryTitle ?? {
      id: `tmdb-${credit.mediaType}-${credit.tmdbId}`,
      type: credit.mediaType,
      name: credit.name,
      firstAired: '',
      posterPath: credit.posterPath ?? ''
    }
    return {
      credit,
      posterTitle,
      libraryPath: libraryTitle ? titlePath(libraryTitle) : undefined,
      watched: libraryTitle !== undefined && watchedTitleIds.value.has(libraryTitle.id),
      tooltip: [credit.name, credit.year, credit.role].filter(Boolean).join(' · ')
    }
  }))

const collapsedCardCount = computed(() => gridColumnCount.value * collapsedRowCount)
const shownCards = computed(() => filmographyExpanded.value ? filmographyCards.value : filmographyCards.value.slice(0, collapsedCardCount.value))
</script>

<template>
  <section
    class="flex flex-col gap-4"
    aria-labelledby="filmography-heading"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2
        id="filmography-heading"
        class="font-display text-xl font-bold text-highlighted"
      >
        Filmography
      </h2>
      <div class="max-w-full overflow-x-auto overscroll-x-contain">
        <UTabs
          v-model="activeFilter"
          :items="filterTabs"
          :content="false"
          color="neutral"
          size="sm"
          :ui="{ root: 'items-start', list: 'w-max', trigger: 'flex-none' }"
        />
      </div>
    </div>
    <ul
      ref="filmographyGrid"
      class="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-x-2.5 gap-y-3 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]"
      aria-label="Filmography"
    >
      <li
        v-for="card in shownCards"
        :key="`${card.credit.mediaType}-${card.credit.tmdbId}-${card.credit.role}`"
      >
        <NuxtLink
          :to="card.libraryPath ?? tmdbPageUrl(card.credit.mediaType, card.credit.tmdbId)"
          :target="card.libraryPath ? undefined : '_blank'"
          :title="card.tooltip"
          class="group flex flex-col gap-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <div class="relative">
            <MediaPosterImage
              :title="card.posterTitle"
              sizes="6rem"
            />
            <span
              v-if="card.watched"
              class="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-inverted"
            >
              <UIcon
                name="i-lucide-check"
                class="size-3.5"
              />
              <span class="sr-only">Watched</span>
            </span>
            <span
              v-if="!card.libraryPath"
              class="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-default/85 text-highlighted backdrop-blur group-hover:bg-primary group-hover:text-inverted"
            >
              <UIcon
                name="i-lucide-arrow-up-right"
                class="size-3.5"
              />
              <span class="sr-only">Opens TMDB in a new tab</span>
            </span>
          </div>
          <span class="flex flex-col text-xs leading-snug">
            <span class="line-clamp-3 font-medium text-highlighted group-hover:text-primary">
              {{ card.credit.name }}
            </span>
            <span class="text-muted tabular-nums">{{ card.credit.year ?? 'TBA' }}</span>
            <span
              v-if="card.credit.role"
              class="line-clamp-2 text-muted"
            >{{ card.credit.role }}</span>
          </span>
        </NuxtLink>
      </li>
    </ul>
    <UButton
      v-if="filmographyCards.length > collapsedCardCount"
      :label="filmographyExpanded ? 'Show fewer' : `Show all ${filmographyCards.length}`"
      :trailing-icon="filmographyExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
      :aria-expanded="filmographyExpanded"
      color="primary"
      variant="link"
      size="sm"
      class="-mt-1 self-start px-0 font-semibold"
      @click="filmographyExpanded = !filmographyExpanded"
    />
    <p
      v-if="filmographyCards.length === 0"
      class="text-sm text-muted"
    >
      No credits in this view.
    </p>
  </section>
</template>
