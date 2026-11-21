<script setup lang="ts">
import type { HistoryEntry, TypeFilter } from '~~/shared/utils/library/types'
import type { HistoryView } from '~~/shared/utils/library/views'
import { episodeCode } from '~~/shared/utils/library/derive'
import { parseIsoDate } from '~~/shared/utils/library/dates'
import { seasonPath, titlePath } from '~/utils/library/paths'
import { formatDuration } from '~~/shared/utils/library/watchTime'

useHead({ title: 'History' })

const typeFilter = ref<TypeFilter>('all')
const typeTabs = [
  { value: 'all', label: 'All' },
  { value: 'tv', label: 'TV' },
  { value: 'anime', label: 'Anime' },
  { value: 'movie', label: 'Movies' }
]

const todayIso = useLibraryToday()
const requestedMonth = ref('latest')
const { data: history } = await useLibraryView<HistoryView>('/api/library/views/history', () => ({ month: requestedMonth.value, type: typeFilter.value }))

const monthStart = (month: string) => parseIsoDate(`${month}-01`)
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const visibleMonth = computed(() => monthStart(requestedMonth.value === 'latest' ? history.value?.month ?? todayIso.value.slice(0, 7) : requestedMonth.value))
const days = computed(() => history.value?.days ?? [])

// Sync pins the shown month before the query recomputes, so switching type stays put instead of jumping to that type's latest month.
watch(typeFilter, () => {
  requestedMonth.value = monthKey(visibleMonth.value)
}, { flush: 'sync' })

function monthLabel(date: Date) {
  return date.toLocaleString('en', { month: 'long', year: 'numeric' })
}

const latestDate = computed(() => (history.value?.latest ? monthStart(history.value.latest) : undefined))
const typeLabel = computed(() => (typeFilter.value === 'all' ? 'anything' : typeTabs.find(tab => tab.value === typeFilter.value)!.label))

function shiftMonth(delta: number) {
  requestedMonth.value = monthKey(new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() + delta, 1))
}

function goToLatest() {
  if (latestDate.value) requestedMonth.value = monthKey(latestDate.value)
}

function dayHeading(date: string) {
  return parseIsoDate(date).toLocaleString('en', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
}

function caption(entry: HistoryEntry) {
  if (!entry.episode) return entry.title.name
  return entry.episode.name ?? episodeCode(entry.title, entry.episode)
}

function entryPath(entry: HistoryEntry) {
  return entry.episode ? seasonPath(entry.title, entry.episode.season) : titlePath(entry.title)
}
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6 lg:p-8">
    <h1 class="font-display text-4xl font-extrabold tracking-tight text-highlighted">
      History
    </h1>

    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          aria-label="Previous month"
          @click="shiftMonth(-1)"
        />
        <h2 class="min-w-40 text-center font-display text-xl font-bold text-highlighted">
          {{ monthLabel(visibleMonth) }}
        </h2>
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          aria-label="Next month"
          @click="shiftMonth(1)"
        />
      </div>
      <UButton
        v-if="latestDate"
        label="Latest"
        color="neutral"
        variant="soft"
        @click="goToLatest"
      />
      <UTabs
        v-model="typeFilter"
        :items="typeTabs"
        :content="false"
        color="neutral"
        size="sm"
        class="ms-auto"
      />
    </div>

    <div
      v-if="!days.length"
      class="flex flex-col items-center gap-3 rounded-xl bg-elevated/60 p-10 text-center"
    >
      <p class="text-muted">
        Nothing watched in {{ monthLabel(visibleMonth) }}{{ typeFilter === 'all' ? '' : ` for ${typeLabel}` }}.
      </p>
      <UButton
        v-if="latestDate && latestDate.getTime() !== visibleMonth.getTime()"
        :label="`Go to ${monthLabel(latestDate)}`"
        color="neutral"
        variant="soft"
        @click="goToLatest"
      />
    </div>

    <ol
      v-else
      class="flex flex-col gap-8"
    >
      <li
        v-for="day in days"
        :key="day.date"
        class="flex flex-col gap-3"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-default pb-2">
          <h3 class="font-display text-lg font-bold text-highlighted">
            {{ dayHeading(day.date) }}
          </h3>
          <span class="text-sm tabular-nums text-muted">
            {{ day.entries.length === 1 ? '1 item' : `${day.entries.length} items` }} · {{ formatDuration(day.totalMinutes) }}
          </span>
        </div>
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
          <li
            v-for="entry in day.entries"
            :key="`${entry.title.id}-${entry.episode?.id ?? 'movie'}-${entry.watchedAt}`"
          >
            <NuxtLink
              :to="entryPath(entry)"
              class="group flex flex-col gap-1.5"
            >
              <MediaPosterImage
                :title="entry.title"
                :progress="entry.progress"
                :badge="formatDuration(entry.minutes)"
                sizes="(min-width: 640px) 10rem, 40vw"
                class="transition group-hover:ring-2 group-hover:ring-primary"
              />
              <span class="flex min-w-0 flex-col">
                <span
                  class="line-clamp-2 text-sm font-medium text-default group-hover:text-primary"
                  :title="caption(entry)"
                >{{ caption(entry) }}</span>
                <span class="flex items-center gap-1.5 text-xs text-muted">
                  <MediaTypeTag :type="entry.title.type" />
                  <span
                    v-if="entry.episode"
                    class="truncate"
                    :title="entry.title.name"
                  >{{ entry.title.name }} · {{ episodeCode(entry.title, entry.episode) }}</span>
                </span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </li>
    </ol>
  </main>
</template>
