<script setup lang="ts">
import type { WatchEvent } from '~/utils/library/types'
import { parseIsoDate } from '~/utils/library/dates'

const props = withDefaults(defineProps<{
  watches: WatchEvent[]
  runtimeMinutes?: number
  todayIso: string
  canAdd?: boolean
}>(), { canAdd: true })

const emit = defineEmits<{
  add: [dateIso: string]
  remove: [watchedAt: string]
}>()

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const dateInputId = useId()
const selectedDateIso = ref(props.todayIso)

function formatDate(watchedAt: string) {
  return dateFormatter.format(parseIsoDate(watchedAt))
}

function submitWatch(todayIso: string) {
  emit('add', selectedDateIso.value || todayIso)
}
</script>

<template>
  <section
    class="flex flex-col gap-3"
    aria-labelledby="watch-history-title"
  >
    <h2
      id="watch-history-title"
      class="font-display text-xl font-bold text-highlighted"
    >
      Watch history
    </h2>
    <p
      v-if="watches.length === 0"
      class="text-sm text-muted"
    >
      No watches logged.
    </p>
    <ul
      v-else
      class="flex flex-col divide-y divide-default border-y border-default"
    >
      <li
        v-for="watch in watches"
        :key="watch.watchedAt"
        class="flex items-center justify-between gap-3 py-2"
      >
        <span class="flex flex-wrap items-baseline gap-x-3 text-sm text-highlighted tabular-nums">
          {{ formatDate(watch.watchedAt) }}
          <span
            v-if="watch.minutesWatched !== undefined && runtimeMinutes && watch.minutesWatched < runtimeMinutes"
            class="text-muted"
          >
            {{ watch.minutesWatched }} of {{ runtimeMinutes }} min
          </span>
        </span>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-trash-2"
          :aria-label="`Remove watch from ${formatDate(watch.watchedAt)}`"
          @click="emit('remove', watch.watchedAt)"
        />
      </li>
    </ul>
    <form
      v-if="canAdd"
      class="flex flex-wrap items-end gap-3"
      @submit.prevent="submitWatch(todayIso)"
    >
      <div class="flex flex-col gap-1">
        <label
          :for="dateInputId"
          class="text-xs font-medium text-muted"
        >
          Watched on
        </label>
        <input
          :id="dateInputId"
          v-model="selectedDateIso"
          type="date"
          :max="todayIso"
          class="rounded-md bg-default dark:[color-scheme:dark] px-2.5 py-1.5 text-sm text-highlighted ring ring-inset ring-accented focus-visible:outline-2 focus-visible:outline-primary"
        >
      </div>
      <UButton
        type="submit"
        color="neutral"
        variant="outline"
        size="md"
        icon="i-lucide-plus"
      >
        Add watch
      </UButton>
    </form>
  </section>
</template>
