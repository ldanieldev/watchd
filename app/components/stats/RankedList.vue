<script setup lang="ts">
const props = withDefaults(defineProps<{
  rows: { label: string, value: number, display: string, to?: string, image?: string, sub?: string }[]
  barClass?: string
}>(), {
  barClass: 'bg-primary'
})

const max = computed(() => Math.max(0, ...props.rows.map(row => row.value)))
</script>

<template>
  <StatsEmptyLine v-if="!rows.length" />
  <ol
    v-else
    class="flex flex-col gap-2.5"
  >
    <li
      v-for="(row, index) in rows"
      :key="row.label"
      class="grid grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] items-center gap-x-2.5 text-sm"
    >
      <span class="text-right tabular-nums text-muted">{{ index + 1 }}</span>
      <img
        width="32"
        height="32"
        v-if="row.image"
        :src="row.image"
        alt=""
        loading="lazy"
        class="size-8 rounded-sm object-cover"
      >
      <span v-else />
      <span class="flex min-w-0 flex-col gap-1">
        <NuxtLink
          v-if="row.to"
          :to="row.to"
          class="truncate text-default hover:text-primary"
          :title="row.label"
        >{{ row.label }}</NuxtLink>
        <span
          v-else
          class="truncate text-default"
          :title="row.label"
        >{{ row.label }}</span>
        <span
          v-if="row.sub"
          class="truncate text-xs text-muted"
        >{{ row.sub }}</span>
        <span class="h-1 rounded-full bg-elevated">
          <span
            class="block h-full rounded-full"
            :class="barClass"
            :style="{ width: cssPercent(max ? (row.value / max) * 100 : 0) }"
          />
        </span>
      </span>
      <span class="whitespace-nowrap text-right tabular-nums text-muted">{{ row.display }}</span>
    </li>
  </ol>
</template>
