<script setup lang="ts">
import type { SearchCategory, SearchHit } from '~~/shared/types/search'
import { mediaTypeStyles } from '~/utils/library/mediaTypes'
import { titlePath } from '~/utils/library/paths'
import { tmdbImage } from '~/utils/library/tmdb'

interface SearchResultItem {
  label: string
  hit: SearchHit
}

const mediaCategories: { value: SearchCategory, label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
  { value: 'anime', label: 'Anime' }
]

const searchQuery = ref('')
const selectedCategory = ref<SearchCategory>('all')
const isDropdownWanted = ref(false)
const isEnterWaitingForLatestResults = ref(false)
let hasKeyboardMovedHighlightSinceQueryChange = false

const { hits, status } = useLibrarySearch(searchQuery, selectedCategory)

watch(status, (nextStatus) => {
  if (nextStatus === 'loading' || !isEnterWaitingForLatestResults.value) return
  isEnterWaitingForLatestResults.value = false
  const firstHit = hits.value[0]
  if (nextStatus === 'ready' && firstHit) openHit(firstHit)
})

watch([searchQuery, selectedCategory], () => {
  hasKeyboardMovedHighlightSinceQueryChange = false
})

watch(isDropdownWanted, (wanted) => {
  if (!wanted) isEnterWaitingForLatestResults.value = false
})

const resultItems = computed<SearchResultItem[]>(() => hits.value.map(hit => ({ label: hit.name, hit })))

const isDropdownOpen = computed(() =>
  isDropdownWanted.value
  && searchQuery.value.trim() !== ''
  && (hits.value.length > 0 || status.value === 'ready' || status.value === 'unavailable')
)

const emptyMessage = computed(() => status.value === 'unavailable' ? 'Search is unavailable' : 'No matches in your library')

function hitMeta(hit: SearchHit): string {
  const typeLabel = mediaTypeStyles[hit.type].label
  return hit.year ? `${typeLabel} · ${hit.year}` : typeLabel
}

function openHit(hit: SearchHit) {
  isDropdownWanted.value = false
  navigateTo(titlePath({ id: hit.titleId, type: hit.type }))
}

function onResultSelected(item: SearchResultItem | null | undefined) {
  if (item) openHit(item.hit)
}

function hideBrokenPoster(event: Event) {
  (event.target as HTMLImageElement).hidden = true
}

const highlightMovingKeys = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End'])

function cancelHeldEnter() {
  isEnterWaitingForLatestResults.value = false
}

function isImeCommitEnter(event: KeyboardEvent): boolean {
  // Safari fires the IME-commit Enter after compositionend with isComposing false but keyCode 229.
  return event.isComposing || event.keyCode === 229
}

// Reka re-highlights the stale first row on every keystroke, so a plain Enter while loading would open the previous query's hit; hold it until the latest results land.
function holdEnterUntilLatestResults(event: KeyboardEvent) {
  if (highlightMovingKeys.has(event.key)) {
    hasKeyboardMovedHighlightSinceQueryChange = true
    cancelHeldEnter()
    return
  }
  if (event.key === 'Escape') {
    cancelHeldEnter()
    return
  }
  if (event.key !== 'Enter' || isImeCommitEnter(event) || !(event.target instanceof HTMLInputElement)) return
  if (status.value !== 'loading' || hasKeyboardMovedHighlightSinceQueryChange) return
  event.preventDefault()
  event.stopPropagation()
  isEnterWaitingForLatestResults.value = true
}

// Reka stops propagation of Enter only when a row is highlighted, so an Enter that reaches here had nothing highlighted.
function openFirstHitWhenNothingHighlighted(event: KeyboardEvent) {
  if (isImeCommitEnter(event)) return
  if (!(event.target instanceof HTMLInputElement)) return
  const firstHit = hits.value[0]
  if (!isDropdownOpen.value || !firstHit) return
  event.preventDefault()
  openHit(firstHit)
}
</script>

<template>
  <div
    class="flex w-full flex-row items-center sm:w-auto"
    @keydown.capture="holdEnterUntilLatestResults"
    @keydown.enter="openFirstHitWhenNothingHighlighted"
    @focusout="cancelHeldEnter"
  >
    <UInputMenu
      v-model:search-term="searchQuery"
      :model-value="null"
      :model-modifiers="{ nullable: true }"
      :open="isDropdownOpen"
      :items="resultItems"
      :loading="status === 'loading'"
      :trailing-icon="false"
      :reset-search-term-on-blur="false"
      :content="{ align: 'start', sideOffset: 6 }"
      ignore-filter
      open-on-click
      class="w-full sm:w-lg lg:w-xl xl:w-3xl"
      icon="i-lucide-search"
      type="text"
      enterkeyhint="search"
      name="searchQuery"
      placeholder="Search..."
      aria-label="Search your library"
      variant="subtle"
      :ui="{
        base: 'pe-32',
        content: 'max-h-[min(30rem,var(--reka-combobox-content-available-height,30rem))] max-sm:w-[calc(100vw-1rem)]',
        group: 'p-1.5',
        empty: 'px-3 py-6 text-sm',
        item: 'cursor-pointer items-center gap-3 px-2 py-1.5'
      }"
      @update:open="isDropdownWanted = $event"
      @update:model-value="onResultSelected"
    >
      <span class="absolute inset-y-0 end-0 flex items-center">
        <USelect
          v-model="selectedCategory"
          variant="none"
          name="selectedCategory"
          aria-label="Search category"
          :items="mediaCategories"
          @update:model-value="isDropdownWanted = true"
        />
      </span>

      <template #item="{ item }">
        <span
          class="relative block aspect-[2/3] w-8 shrink-0 overflow-hidden rounded-sm bg-linear-to-b ring-1 ring-default/60"
          :class="mediaTypeStyles[item.hit.type].fallbackClass"
        >
          <img
            v-if="item.hit.posterPath"
            :key="item.hit.posterPath"
            :src="tmdbImage(item.hit.posterPath, 'w92')"
            alt=""
            width="92"
            height="138"
            loading="lazy"
            decoding="async"
            class="absolute inset-0 size-full object-cover"
            @error="hideBrokenPoster"
          >
        </span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span
            class="truncate font-medium text-highlighted"
            :title="item.hit.name"
          >{{ item.hit.name }}</span>
          <span
            v-if="item.hit.matchedAlias"
            class="truncate text-xs text-muted"
            :title="item.hit.matchedAlias"
          >also: {{ item.hit.matchedAlias }}</span>
        </span>
        <span class="flex shrink-0 items-center gap-1.5 text-xs text-muted tabular-nums">
          <span
            class="size-1.5 rounded-full"
            :class="mediaTypeStyles[item.hit.type].barClass"
            aria-hidden="true"
          />
          {{ hitMeta(item.hit) }}
        </span>
      </template>

      <template #empty>
        {{ emptyMessage }}
      </template>
    </UInputMenu>
  </div>
</template>
