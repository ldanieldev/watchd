<script setup lang="ts">
import type { Title } from '~/utils/library/types'

export interface ShelfItem {
  key: string
  title: Title
  caption: string
  progress?: number
}

defineProps<{
  heading: string
  items: ShelfItem[]
}>()
</script>

<template>
  <section
    v-if="items.length"
    class="flex flex-col gap-3"
  >
    <div class="flex items-baseline justify-between">
      <h2 class="font-display text-xl font-bold text-highlighted">
        {{ heading }}
      </h2>
      <ULink
        class="text-sm text-muted hover:text-default"
        aria-disabled="true"
      >
        See all
      </ULink>
    </div>
    <ul
      class="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-1 pb-2 focus-visible:outline-2 focus-visible:outline-primary"
      tabindex="0"
      :aria-label="heading"
    >
      <li
        v-for="item in items"
        :key="item.key"
        class="w-32 shrink-0 snap-start sm:w-36 lg:w-40"
      >
        <MediaPosterImage
          :title="item.title"
          :progress="item.progress"
          sizes="10rem"
        />
        <p class="mt-2 line-clamp-1 text-sm font-medium text-highlighted">
          {{ item.title.name }}
        </p>
        <p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <MediaTypeTag :type="item.title.type" />
          <span class="truncate">{{ item.caption }}</span>
        </p>
      </li>
    </ul>
  </section>
</template>
