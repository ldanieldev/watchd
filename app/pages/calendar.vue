<script setup lang="ts">
import type { MediaType, Release } from '~~/shared/utils/library/types'
import { monthGrid } from '~~/shared/utils/library/derive'
import { addDays, parseIsoDate, toIsoDate } from '~~/shared/utils/library/dates'

useHead({ title: 'Calendar' })

const AGENDA_DAYS = 60

const todayIso = useLibraryToday()
const today = computed(() => parseIsoDate(todayIso.value))

const visibleMonth = ref(new Date(today.value.getFullYear(), today.value.getMonth(), 1))
const selectedDate = ref(todayIso.value)
const typeFilter = ref<MediaType | 'all'>('all')
const view = ref<'month' | 'agenda'>('month')

const typeTabs = [
  { value: 'all', label: 'All' },
  { value: 'tv', label: 'TV' },
  { value: 'anime', label: 'Anime' },
  { value: 'movie', label: 'Movies' }
]
const viewTabs = [
  { value: 'month', label: 'Month', icon: 'i-lucide-calendar-days' },
  { value: 'agenda', label: 'Agenda', icon: 'i-lucide-list' }
]

const monthLabel = computed(() => visibleMonth.value.toLocaleString('en', { month: 'long', year: 'numeric' }))

function filtered(releases: Release[]) {
  return typeFilter.value === 'all' ? releases : releases.filter(release => release.title.type === typeFilter.value)
}

function byDate(releases: Release[]) {
  const grouped = new Map<string, Release[]>()
  for (const release of releases) grouped.set(release.date, [...(grouped.get(release.date) ?? []), release])
  return grouped
}

const gridRange = computed(() => {
  const weeks = monthGrid(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth())
  return { from: weeks[0]![0]!.date, to: weeks.at(-1)!.at(-1)!.date }
})

// Shifting months keeps the selected day, which can leave it outside the grid, so the range stretches to cover it.
const [{ data: shownReleases }, { data: agendaReleases }] = await Promise.all([
  useLibraryView<Release[]>('/api/library/views/releases', () => ({
    from: [gridRange.value.from, selectedDate.value].sort()[0]!,
    to: [gridRange.value.to, selectedDate.value].sort()[1]!
  })),
  useLibraryView<Release[]>('/api/library/views/releases', () => ({ from: todayIso.value, to: toIsoDate(addDays(today.value, AGENDA_DAYS)) }))
])

const monthReleases = computed(() => byDate(filtered((shownReleases.value ?? []).filter(release => release.date >= gridRange.value.from && release.date <= gridRange.value.to))))

const selectedReleases = computed(() => filtered((shownReleases.value ?? []).filter(release => release.date === selectedDate.value)))

const agenda = computed(() => [...byDate(filtered(agendaReleases.value ?? []))])

function shiftMonth(delta: number) {
  visibleMonth.value = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() + delta, 1)
}

function goToToday() {
  visibleMonth.value = new Date(today.value.getFullYear(), today.value.getMonth(), 1)
  selectedDate.value = todayIso.value
}

function longDate(date: string) {
  return date === todayIso.value
    ? `Today, ${parseIsoDate(date).toLocaleString('en', { month: 'long', day: 'numeric' })}`
    : parseIsoDate(date).toLocaleString('en', { weekday: 'long', month: 'long', day: 'numeric' })
}
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6 lg:p-8">
    <h1 class="font-display text-4xl font-extrabold tracking-tight text-highlighted">
      Calendar
    </h1>

    <div class="flex flex-wrap items-center gap-3">
      <div
        v-if="view === 'month'"
        class="flex items-center gap-1"
      >
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          aria-label="Previous month"
          @click="shiftMonth(-1)"
        />
        <h2 class="min-w-40 text-center font-display text-xl font-bold text-highlighted">
          {{ monthLabel }}
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
        v-if="view === 'month'"
        label="Today"
        color="neutral"
        variant="soft"
        @click="goToToday"
      />
      <div class="ms-auto flex flex-wrap items-center gap-2">
        <UTabs
          v-model="typeFilter"
          :items="typeTabs"
          :content="false"
          color="neutral"
          size="sm"
        />
        <UTabs
          v-model="view"
          :items="viewTabs"
          :content="false"
          color="neutral"
          size="sm"
        />
      </div>
    </div>

    <div
      v-if="view === 'month'"
      class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"
    >
      <MediaCalendarMonth
        v-model:selected="selectedDate"
        :year="visibleMonth.getFullYear()"
        :month-index="visibleMonth.getMonth()"
        :today-iso="todayIso"
        :releases-by-date="monthReleases"
      />
      <aside
        class="flex flex-col gap-4 self-start rounded-xl bg-elevated/60 p-4"
        aria-live="polite"
      >
        <div>
          <h2 class="font-display text-lg font-bold text-highlighted">
            {{ longDate(selectedDate) }}
          </h2>
          <p class="text-sm text-muted">
            {{ selectedReleases.length === 1 ? '1 release' : `${selectedReleases.length} releases` }}
          </p>
        </div>
        <p
          v-if="!selectedReleases.length"
          class="text-sm text-muted"
        >
          Nothing you're tracking airs this day.
        </p>
        <ul class="flex flex-col gap-3">
          <li
            v-for="release in selectedReleases"
            :key="`${release.title.id}-${release.episode?.id ?? 'movie'}`"
          >
            <MediaReleaseCard :release="release" />
          </li>
        </ul>
      </aside>
    </div>

    <ol
      v-else
      class="flex flex-col gap-6"
    >
      <li
        v-for="[date, releases] in agenda"
        :key="date"
        class="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]"
      >
        <h2
          class="font-display text-lg font-bold"
          :class="date === todayIso ? 'text-primary' : 'text-highlighted'"
        >
          {{ longDate(date) }}
        </h2>
        <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <li
            v-for="release in releases"
            :key="`${release.title.id}-${release.episode?.id ?? 'movie'}`"
            class="rounded-lg bg-elevated/60 p-2.5"
          >
            <MediaReleaseCard :release="release" />
          </li>
        </ul>
      </li>
    </ol>
  </main>
</template>
