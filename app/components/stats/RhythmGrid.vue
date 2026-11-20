<script setup lang="ts">
import { formatDuration } from '~/utils/library/watchTime'

const props = defineProps<{
  cells: number[][]
}>()

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_LABELS: Record<number, string> = { 0: '12am', 6: '6am', 12: '12pm', 18: '6pm' }

const active = ref<string>()
const max = computed(() => Math.max(0, ...props.cells.flat()))

function dotSize(minutes: number) {
  return `${30 + 70 * Math.sqrt(minutes / max.value)}%`
}

function hourLabel(hour: number) {
  const suffix = hour < 12 ? 'am' : 'pm'
  return `${hour % 12 || 12}${suffix}`
}

function describe(weekday: number, hour: number, minutes: number) {
  return `${WEEKDAYS[weekday]} ${hourLabel(hour)} · ${formatDuration(minutes)}`
}
</script>

<template>
  <StatsEmptyLine v-if="!max" />
  <div
    v-else
    class="flex flex-col gap-2"
  >
    <div class="overflow-x-auto overscroll-x-contain pb-1">
      <div class="grid w-max grid-cols-[auto_repeat(24,minmax(0.875rem,1.75rem))] items-center gap-y-1 text-xs text-muted">
        <span />
        <span
          v-for="hour in 24"
          :key="hour"
          class="whitespace-nowrap"
        >{{ HOUR_LABELS[hour - 1] ?? '' }}</span>
        <template
          v-for="(row, weekday) in cells"
          :key="weekday"
        >
          <span class="pr-2">{{ WEEKDAYS[weekday] }}</span>
          <span
            v-for="(minutes, hour) in row"
            :key="hour"
            class="flex aspect-square items-center justify-center"
          >
            <button
              v-if="minutes"
              data-dot
              type="button"
              class="rounded-full bg-primary focus-visible:outline-2 focus-visible:outline-primary"
              :style="{ width: dotSize(minutes), height: dotSize(minutes) }"
              :aria-label="describe(weekday, hour, minutes)"
              @mouseenter="active = describe(weekday, hour, minutes)"
              @focus="active = describe(weekday, hour, minutes)"
            />
            <span
              v-else
              class="size-0.5 rounded-full bg-accented"
            />
          </span>
        </template>
      </div>
    </div>
    <span
      class="text-xs text-muted"
      aria-live="polite"
    >{{ active ?? 'Hover a dot for details' }}</span>
  </div>
</template>
