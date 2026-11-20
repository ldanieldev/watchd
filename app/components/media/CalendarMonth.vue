<script setup lang="ts">
import type { Release } from '~/utils/library/types'
import { monthGrid } from '~/utils/library/derive'
import { mediaTypeStyles } from '~/utils/library/mediaTypes'
import { parseIsoDate } from '~/utils/library/dates'

const props = defineProps<{
  year: number
  monthIndex: number
  todayIso: string
  releasesByDate: Map<string, Release[]>
}>()

const selected = defineModel<string>('selected', { required: true })

const VISIBLE_PER_DAY = 3
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const weeks = computed(() => monthGrid(props.year, props.monthIndex))

function dayLabel(date: string, count: number) {
  const day = parseIsoDate(date).toLocaleString('en', { weekday: 'long', month: 'long', day: 'numeric' })
  return `${day}, ${count === 1 ? '1 release' : `${count} releases`}`
}
</script>

<template>
  <div
    class="grid grid-cols-7 gap-1 sm:gap-1.5"
    role="grid"
  >
    <div
      v-for="weekday in weekdays"
      :key="weekday"
      class="px-1.5 pb-1 text-xs font-medium text-muted"
      role="columnheader"
    >
      {{ weekday }}
    </div>
    <template
      v-for="week in weeks"
      :key="week[0]!.date"
    >
      <button
        v-for="cell in week"
        :key="cell.date"
        type="button"
        role="gridcell"
        class="flex min-h-16 flex-col gap-1 rounded-md p-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:min-h-24"
        :class="[
          cell.inMonth ? 'bg-elevated/60 hover:bg-elevated' : 'bg-transparent opacity-35',
          cell.date < todayIso && cell.inMonth && 'opacity-55',
          cell.date === todayIso && 'ring-2 ring-primary',
          cell.date === selected && 'bg-accented! opacity-100'
        ]"
        :aria-label="dayLabel(cell.date, releasesByDate.get(cell.date)?.length ?? 0)"
        :aria-selected="cell.date === selected"
        @click="selected = cell.date"
      >
        <span
          class="text-xs font-semibold"
          :class="cell.date === todayIso ? 'text-primary' : 'text-highlighted'"
        >
          {{ parseIsoDate(cell.date).getDate() }}
        </span>
        <span
          v-for="release in (releasesByDate.get(cell.date) ?? []).slice(0, VISIBLE_PER_DAY)"
          :key="`${release.title.id}-${release.episode?.id ?? 'movie'}`"
          class="flex min-w-0 items-center gap-1 text-[0.6875rem] leading-tight text-default"
        >
          <span
            class="h-2.5 w-1 shrink-0 rounded-full"
            :class="mediaTypeStyles[release.title.type].barClass"
          />
          <span class="hidden truncate sm:inline">{{ release.title.name }}</span>
        </span>
        <span
          v-if="(releasesByDate.get(cell.date)?.length ?? 0) > VISIBLE_PER_DAY"
          class="text-[0.6875rem] text-muted"
        >
          +{{ releasesByDate.get(cell.date)!.length - VISIBLE_PER_DAY }} more
        </span>
      </button>
    </template>
  </div>
</template>
