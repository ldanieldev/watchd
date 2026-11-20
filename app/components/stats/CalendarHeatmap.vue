<script setup lang="ts">
import { parseIsoDate } from '~/utils/library/dates'
import { formatDuration } from '~/utils/library/watchTime'

const props = defineProps<{
  days: { date: string, minutes: number }[]
}>()

const LEVEL_CLASSES = ['bg-elevated', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary']
const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

const active = ref<{ date: string, minutes: number }>()

const thresholds = computed(() => {
  const sorted = props.days.map(day => day.minutes).filter(minutes => minutes > 0).sort((first, second) => first - second)
  return [0.25, 0.5, 0.75].map(quantile => sorted[Math.floor(quantile * (sorted.length - 1))] ?? 0)
})

function level(minutes: number) {
  if (!minutes) return 0
  return 1 + thresholds.value.filter(threshold => minutes > threshold).length
}

const leadingBlanks = computed(() => (props.days[0] ? (parseIsoDate(props.days[0].date).getDay() + 6) % 7 : 0))

const monthLabels = computed(() => {
  const labels: { column: number, label: string }[] = []
  props.days.forEach((day, index) => {
    const date = parseIsoDate(day.date)
    if (date.getDate() !== 1 && index !== 0) return
    const column = Math.floor((index + leadingBlanks.value) / 7)
    if (labels.at(-1)?.column === column) labels.pop()
    labels.push({ column, label: date.toLocaleString('en', { month: 'short' }) })
  })
  return labels
})

const columnCount = computed(() => Math.ceil((props.days.length + leadingBlanks.value) / 7))
const hasActivity = computed(() => props.days.some(day => day.minutes > 0))

function describe(day: { date: string, minutes: number }) {
  const date = parseIsoDate(day.date).toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  return `${date} · ${day.minutes ? formatDuration(day.minutes) : 'nothing watched'}`
}
</script>

<template>
  <StatsEmptyLine v-if="!hasActivity" />
  <div
    v-else
    class="flex flex-col gap-2"
  >
    <div class="overflow-x-auto overscroll-x-contain pb-1">
      <div
        class="grid w-max gap-1 text-xs text-muted"
        :style="{ gridTemplateColumns: `auto repeat(${columnCount}, 0.875rem)` }"
      >
        <span />
        <span
          v-for="month in monthLabels"
          :key="`${month.column}-${month.label}`"
          class="whitespace-nowrap"
          :style="{ gridColumn: `${month.column + 2} / span 3`, gridRow: 1 }"
        >{{ month.label }}</span>
        <span
          v-for="(label, row) in WEEKDAY_LABELS"
          :key="row"
          class="pr-2 leading-3.5"
          :style="{ gridColumn: 1, gridRow: row + 2 }"
        >{{ label }}</span>
        <button
          v-for="(day, index) in days"
          :key="day.date"
          data-day
          type="button"
          class="size-3.5 rounded-[3px] focus-visible:outline-2 focus-visible:outline-primary"
          :class="LEVEL_CLASSES[level(day.minutes)]"
          :style="{ gridColumn: Math.floor((index + leadingBlanks) / 7) + 2, gridRow: ((index + leadingBlanks) % 7) + 2 }"
          :aria-label="describe(day)"
          @mouseenter="active = day"
          @focus="active = day"
        />
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <span aria-live="polite">{{ active ? describe(active) : 'Hover a day for details' }}</span>
      <span class="flex items-center gap-1">
        Less
        <span
          v-for="levelClass in LEVEL_CLASSES"
          :key="levelClass"
          class="size-2.5 rounded-[3px]"
          :class="levelClass"
        />
        More
      </span>
    </div>
  </div>
</template>
