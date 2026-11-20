<script setup lang="ts">
const props = withDefaults(defineProps<{
  bars: { label: string, value: number, tooltip: string }[]
  barClass?: string
  labelEvery?: number
  wrapLabels?: boolean
}>(), {
  barClass: 'bg-primary',
  labelEvery: 1,
  wrapLabels: false
})

const max = computed(() => Math.max(0, ...props.bars.map(bar => bar.value)))
</script>

<template>
  <StatsEmptyLine v-if="!max" />
  <div
    v-else
    class="flex flex-col gap-1.5"
  >
    <div class="flex h-36 items-end gap-1 border-b border-default">
      <UTooltip
        v-for="bar in bars"
        :key="bar.label"
        :text="`${bar.label}: ${bar.tooltip}`"
        :content="{ side: 'top' }"
      >
        <div
          class="group flex h-full min-w-0 flex-1 cursor-default items-end"
          tabindex="0"
          :aria-label="`${bar.label}: ${bar.tooltip}`"
        >
          <div
            data-bar
            class="mx-auto w-full max-w-8 rounded-t-sm transition-opacity group-hover:opacity-75 group-focus-visible:opacity-75"
            :class="barClass"
            :style="{ height: `${(bar.value / max) * 100}%` }"
          />
        </div>
      </UTooltip>
    </div>
    <div class="flex gap-1 text-xs text-muted">
      <span
        v-for="(bar, index) in bars"
        :key="bar.label"
        class="min-w-0 flex-1 text-center"
        :class="wrapLabels ? 'leading-tight text-balance' : 'overflow-visible whitespace-nowrap'"
      >
        {{ index % labelEvery === 0 ? bar.label : '' }}
      </span>
    </div>
  </div>
</template>
