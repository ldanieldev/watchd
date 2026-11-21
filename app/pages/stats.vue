<script setup lang="ts">
import type { MediaType, TitleStatus, TypeFilter } from '~/utils/library/types'
import type { CreditRole, StatsRange } from '~/utils/library/stats'
import type { ShelfItem } from '~/components/media/PosterShelf.vue'
import {
  averages,
  changePercent,
  completedOfStarted,
  dailyMinutes,
  eraLeaders,
  featuredPerson,
  genreLeaders,
  highlights,
  minutesByHour,
  minutesByMonth,
  minutesByType,
  minutesByWeekday,
  mostActiveWeekday,
  mostPlayed,
  rhythm,
  roleLeaders,
  statsWindow,
  statusByType,
  statusCounts,
  statWatches,
  streaks,
  studioLeaders,
  totals
} from '~/utils/library/stats'
import { mediaTypeStyles } from '~/utils/library/mediaTypes'
import { statusStyles } from '~/utils/library/statusStyles'
import { parseIsoDate } from '~/utils/library/dates'
import { formatDuration } from '~/utils/library/watchTime'

useHead({ title: 'Statistics' })

const { data, today, summaries } = useLibrary()

const range = ref<StatsRange>('12m')
const typeFilter = ref<TypeFilter>('all')
const compare = ref(true)
const peopleMetric = ref<'plays' | 'titles'>('plays')
const studioMetric = ref<'plays' | 'titles'>('plays')
const tasteMetric = ref<'minutes' | 'plays'>('minutes')

const rangeItems = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'all', label: 'All time' }
]
const RANGE_PHRASES: Record<StatsRange, string> = { '30d': '30 days', '90d': '90 days', '12m': '12 months', 'all': 'period' }
const typeTabs = [
  { value: 'all', label: 'All' },
  { value: 'tv', label: 'TV' },
  { value: 'anime', label: 'Anime' },
  { value: 'movie', label: 'Movies' }
]
const countMetricTabs = [{ value: 'plays', label: 'Plays' }, { value: 'titles', label: 'Titles' }]
const tasteMetricTabs = [{ value: 'minutes', label: 'Time' }, { value: 'plays', label: 'Plays' }]
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MEDIA_TYPES: MediaType[] = ['tv', 'anime', 'movie']
const TOP_HEADINGS: Record<MediaType, string> = { tv: 'Top TV', anime: 'Top anime', movie: 'Top movies' }
const STATUSES = Object.keys(statusStyles) as TitleStatus[]
const ROLE_SHELVES: { role: CreditRole, heading: string }[] = [
  { role: 'actor', heading: 'Actors' },
  { role: 'director', heading: 'Directors' },
  { role: 'writer', heading: 'Writers' }
]

const window = computed(() => statsWindow(range.value, today.value, data.value))
const watches = computed(() => statWatches(data.value, typeFilter.value, window.value.from, window.value.to))
const previousWatches = computed(() => statWatches(data.value, typeFilter.value, window.value.previousFrom, window.value.previousTo))

const total = computed(() => totals(watches.value))
const previousTotal = computed(() => totals(previousWatches.value))
const timeDelta = computed(() => (compare.value ? changePercent(total.value.minutes, previousTotal.value.minutes) : undefined))
const found = computed(() => highlights(data.value, watches.value, today.value))
const streak = computed(() => streaks(watches.value, today.value))
const busiest = computed(() => mostActiveWeekday(watches.value))
const completion = computed(() => completedOfStarted(summaries.value, typeFilter.value))
const average = computed(() => averages(watches.value, window.value))
const featured = computed(() => featuredPerson(watches.value))
const visibleTypes = computed(() => (typeFilter.value === 'all' ? MEDIA_TYPES : [typeFilter.value]))

function hours(minutes: number) {
  const value = minutes / 60
  return value >= 10 ? Math.round(value).toLocaleString('en') : value.toFixed(1)
}

function plural(count: number, word: string) {
  return `${count.toLocaleString('en')} ${count === 1 ? word : `${word}s`}`
}

const heroSubline = computed(() => {
  if (!total.value.minutes) return 'Nothing watched in this range yet.'
  const days = Math.round(total.value.minutes / 60 / 24)
  const span = days ? `That's ${plural(days, 'day')} of watching` : 'That\'s less than a day of watching'
  const delta = timeDelta.value
  if (delta === undefined) return `${span}.`
  const direction = delta >= 0 ? 'more' : 'less'
  return `${span}, ${Math.abs(Math.round(delta))}% ${direction} than the ${RANGE_PHRASES[range.value]} before.`
})

const typeSegments = computed(() => {
  const byType = minutesByType(watches.value)
  return MEDIA_TYPES.map(type => ({ label: mediaTypeStyles[type].label, value: byType[type], colorClass: mediaTypeStyles[type].barClass, display: `${hours(byType[type])} h` }))
})

const monthBars = computed(() => minutesByMonth(watches.value, window.value).map(({ month, minutes }) => {
  const date = parseIsoDate(`${month}-01`)
  return { label: date.toLocaleString('en', { month: 'short' }), value: minutes, tooltip: `${date.toLocaleString('en', { month: 'long', year: 'numeric' })}, ${formatDuration(minutes)}` }
}))
const weekdayBars = computed(() => minutesByWeekday(watches.value).map((minutes, weekday) => ({
  label: WEEKDAYS[weekday]!.slice(0, 3),
  value: minutes,
  tooltip: formatDuration(minutes)
})))
const hourBars = computed(() => minutesByHour(watches.value).map((minutes, hour) => ({
  label: `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`,
  value: minutes,
  tooltip: formatDuration(minutes)
})))

function tasteBars(rows: { item: string, value: number }[]) {
  return rows.map(row => ({ label: row.item, value: row.value, tooltip: tasteMetric.value === 'minutes' ? formatDuration(row.value) : plural(row.value, 'play') }))
}
const genreBars = computed(() => tasteBars(genreLeaders(watches.value, tasteMetric.value, 6)))
const eraBars = computed(() => tasteBars(eraLeaders(watches.value, tasteMetric.value, Number.POSITIVE_INFINITY).sort((first, second) => first.item.localeCompare(second.item))))

function topShelf(type: MediaType): ShelfItem[] {
  return mostPlayed(watches.value, type).map(row => ({
    key: row.title.id,
    title: row.title,
    caption: `${formatDuration(row.minutes)}, ${plural(row.plays, type === 'movie' ? 'play' : 'episode')}`
  }))
}

function peopleFor(role: CreditRole) {
  return roleLeaders(watches.value, role, peopleMetric.value, 8).map(row => ({
    ...row.item,
    role: plural(row.value, peopleMetric.value === 'plays' ? 'play' : 'title')
  }))
}

const studioRows = computed(() => studioLeaders(watches.value, studioMetric.value).map(row => ({
  label: row.item,
  value: row.value,
  display: plural(row.value, studioMetric.value === 'plays' ? 'play' : 'title')
})))

const statusSegments = computed(() => {
  const counts = statusCounts(summaries.value, typeFilter.value)
  return STATUSES.map(status => ({ label: statusStyles[status].label, value: counts[status], colorClass: statusStyles[status].colorClass, display: plural(counts[status], 'title') }))
})
const statusTable = computed(() => statusByType(summaries.value))
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col gap-12 overflow-y-auto p-4 sm:p-6 lg:p-8">
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="font-display text-4xl font-extrabold tracking-tight text-highlighted">
          Statistics
        </h1>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <USelect
            v-model="range"
            :items="rangeItems"
            aria-label="Time range"
            class="w-40"
          />
          <UTabs
            v-model="typeFilter"
            :items="typeTabs"
            :content="false"
            color="neutral"
            size="sm"
            :ui="{ root: 'items-start' }"
          />
          <USwitch
            v-model="compare"
            label="Compare with the period before"
          />
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <h2 class="font-display text-4xl font-extrabold tracking-tight text-balance text-highlighted sm:text-5xl">
          {{ Math.round(total.minutes / 60).toLocaleString('en') }} hours across {{ total.titles }} titles
        </h2>
        <p class="max-w-prose text-muted">
          {{ heroSubline }}
        </p>
      </div>

      <div
        v-if="found.first"
        class="grid gap-3 sm:grid-cols-3"
      >
        <StatsHighlightCard
          label="First in this range"
          :watch="found.first"
        />
        <StatsHighlightCard
          v-if="found.last"
          label="Most recent"
          :watch="found.last"
        />
        <StatsHighlightCard
          v-if="found.todayInHistory"
          :label="`On this day in ${found.todayInHistory.date.slice(0, 4)}`"
          :watch="found.todayInHistory"
        />
      </div>
    </div>

    <section class="flex flex-col gap-6">
      <h2 class="font-display text-2xl font-bold text-highlighted">
        Your year
      </h2>
      <StatsCalendarHeatmap :days="dailyMinutes(watches, window)" />
      <dl class="grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-3 xl:grid-cols-5">
        <StatsStatTile
          label="Time watched"
          :value="`${hours(total.minutes)} h`"
          :delta="timeDelta"
          :sub="plural(total.plays, 'play')"
        />
        <StatsStatTile
          label="Daily average"
          :value="formatDuration(Math.round(average.perDay))"
          :sub="`${average.playsPerDay.toFixed(1)} plays a day`"
        />
        <StatsStatTile
          label="Current streak"
          :value="plural(streak.current, 'day')"
          :sub="`Longest ${plural(streak.longest, 'day')}`"
        />
        <StatsStatTile
          label="Busiest day"
          :value="busiest ? WEEKDAYS[busiest.weekday]! : 'None yet'"
          :sub="busiest ? `${Math.round(busiest.share * 100)}% of your time` : undefined"
        />
        <StatsStatTile
          label="Finished"
          :value="`${completion.completed} of ${completion.started}`"
          sub="titles you've started"
        />
      </dl>
    </section>

    <section class="flex flex-col gap-8">
      <h2 class="font-display text-2xl font-bold text-highlighted">
        When you watch
      </h2>
      <div class="grid gap-x-10 gap-y-8 xl:grid-cols-2">
        <StatsPanel
          title="Through the week"
          description="Each dot is an hour of the day; bigger means more time."
        >
          <StatsRhythmGrid :cells="rhythm(watches)" />
        </StatsPanel>
        <StatsPanel title="Time of day">
          <StatsBarChart
            :bars="hourBars"
            :label-every="6"
          />
        </StatsPanel>
        <StatsPanel title="By month">
          <StatsBarChart :bars="monthBars" />
        </StatsPanel>
        <StatsPanel title="By day of the week">
          <StatsBarChart :bars="weekdayBars" />
        </StatsPanel>
      </div>
    </section>

    <section class="flex flex-col gap-8">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-display text-2xl font-bold text-highlighted">
          What you watch
        </h2>
        <UTabs
          v-model="tasteMetric"
          :items="tasteMetricTabs"
          :content="false"
          color="neutral"
          size="xs"
          aria-label="Measure genres and eras by"
        />
      </div>
      <StatsPanel
        v-if="typeFilter === 'all'"
        title="Where your time goes"
      >
        <StatsSplitBar :segments="typeSegments" />
      </StatsPanel>
      <div class="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <StatsPanel title="Genres">
          <StatsBarChart
            :bars="genreBars"
            wrap-labels
          />
        </StatsPanel>
        <StatsPanel title="Decades">
          <StatsBarChart :bars="eraBars" />
        </StatsPanel>
      </div>
      <template
        v-for="type in visibleTypes"
        :key="type"
      >
        <MediaPosterShelf
          v-if="topShelf(type).length"
          :heading="TOP_HEADINGS[type]"
          :items="topShelf(type)"
          :show-see-all="false"
          heading-tag="h3"
        />
      </template>
    </section>

    <section class="flex flex-col gap-8">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-display text-2xl font-bold text-highlighted">
          Who's in it
        </h2>
        <UTabs
          v-model="peopleMetric"
          :items="countMetricTabs"
          :content="false"
          color="neutral"
          size="xs"
          aria-label="Rank people by"
        />
      </div>
      <StatsPanel
        v-if="featured"
        title="Turns up the most"
        :description="`Credited on ${plural(featured.titles.length, 'title')} you watched in this range.`"
      >
        <StatsFeaturedPerson :featured="featured" />
      </StatsPanel>
      <StatsEmptyLine v-else />
      <template
        v-for="shelf in ROLE_SHELVES"
        :key="shelf.role"
      >
        <MediaDetailPeopleShelf
          :heading="shelf.heading"
          :people="peopleFor(shelf.role)"
          heading-tag="h3"
        />
      </template>
      <StatsPanel
        title="Studios and networks"
        class="max-w-3xl"
      >
        <template #actions>
          <UTabs
            v-model="studioMetric"
            :items="countMetricTabs"
            :content="false"
            color="neutral"
            size="xs"
            aria-label="Rank studios by"
          />
        </template>
        <StatsRankedList :rows="studioRows" />
      </StatsPanel>
    </section>

    <section class="flex flex-col gap-8">
      <h2 class="font-display text-2xl font-bold text-highlighted">
        Your library
      </h2>
      <div class="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <StatsPanel title="Where every title stands">
          <StatsSplitBar :segments="statusSegments" />
        </StatsPanel>
        <StatsPanel title="By type">
          <div
            class="overflow-x-auto"
            tabindex="0"
            role="region"
            aria-label="Titles by status and type"
          >
            <table class="w-full text-sm tabular-nums">
              <thead class="text-muted">
                <tr>
                  <th
                    scope="col"
                    class="py-1.5 pr-3 text-left font-medium"
                  >
                    Type
                  </th>
                  <th
                    v-for="status in STATUSES"
                    :key="status"
                    scope="col"
                    class="px-2 py-1.5 text-right font-medium"
                  >
                    {{ statusStyles[status].label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="type in visibleTypes"
                  :key="type"
                  class="border-t border-default"
                >
                  <th
                    scope="row"
                    class="py-2 pr-3 text-left font-normal"
                  >
                    <MediaTypeTag :type="type" />
                  </th>
                  <td
                    v-for="status in STATUSES"
                    :key="status"
                    class="px-2 py-2 text-right text-default"
                  >
                    {{ statusTable[type][status] }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </StatsPanel>
      </div>
    </section>
  </main>
</template>
