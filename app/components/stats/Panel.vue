<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <figure class="flex min-w-0 flex-col gap-4">
    <figcaption class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <h3 class="font-display text-base font-bold text-highlighted">
          {{ title }}
        </h3>
        <p
          v-if="description"
          class="text-sm text-muted"
        >
          {{ description }}
        </p>
      </div>
      <slot name="actions" />
    </figcaption>
    <slot />
  </figure>
</template>
