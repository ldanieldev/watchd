<script setup lang="ts">
const props = defineProps<{
  label: string
  value: string
  sub?: string
  delta?: number
}>()

const deltaLabel = computed(() => (props.delta === undefined ? undefined : `${props.delta >= 0 ? '+' : '−'}${Math.abs(Math.round(props.delta))}%`))
</script>

<template>
  <div class="flex min-w-0 flex-col gap-0.5">
    <dt class="text-sm text-muted">
      {{ label }}
    </dt>
    <dd class="flex items-baseline gap-2">
      <span class="font-display text-2xl font-bold tabular-nums text-highlighted">{{ value }}</span>
      <span
        v-if="deltaLabel"
        class="text-sm font-medium tabular-nums"
        :class="delta! >= 0 ? 'text-success' : 'text-error'"
      >{{ deltaLabel }}</span>
    </dd>
    <dd
      v-if="sub"
      class="text-sm text-muted"
    >
      {{ sub }}
    </dd>
  </div>
</template>
