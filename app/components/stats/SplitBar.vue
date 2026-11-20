<script setup lang="ts">
const props = defineProps<{
  segments: { label: string, value: number, colorClass: string, display: string }[]
}>()

const total = computed(() => props.segments.reduce((sum, segment) => sum + segment.value, 0))
const visible = computed(() => props.segments.filter(segment => segment.value > 0))

function share(value: number) {
  return `${Math.round((value / total.value) * 100)}%`
}
</script>

<template>
  <StatsEmptyLine v-if="!total" />
  <div
    v-else
    class="flex flex-col gap-3"
  >
    <div
      class="flex h-3 gap-0.5 overflow-hidden rounded-full"
      aria-hidden="true"
    >
      <span
        v-for="segment in visible"
        :key="segment.label"
        data-segment
        class="min-w-1 basis-0"
        :class="segment.colorClass"
        :style="{ flexGrow: segment.value }"
      />
    </div>
    <ul class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <li
        v-for="segment in visible"
        :key="segment.label"
        class="flex items-baseline gap-2"
      >
        <span
          class="size-2.5 shrink-0 self-center rounded-sm"
          :class="segment.colorClass"
          aria-hidden="true"
        />
        <span class="text-default">{{ segment.label }}</span>
        <span class="font-display font-bold tabular-nums text-highlighted">{{ share(segment.value) }}</span>
        <span class="tabular-nums text-muted">{{ segment.display }}</span>
      </li>
    </ul>
  </div>
</template>
