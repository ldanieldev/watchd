<script setup lang="ts">
import type { Title } from '~~/shared/utils/library/types'
import { titlePath } from '~/utils/library/paths'

export interface ShelfItem {
  key: string
  title: Title
  caption: string
  progress?: number
}

withDefaults(defineProps<{
  heading: string
  items: ShelfItem[]
  showSeeAll?: boolean
  headingTag?: 'h2' | 'h3'
}>(), { showSeeAll: true, headingTag: 'h2' })
</script>

<template>
  <section
    v-if="items.length"
    class="flex flex-col gap-3"
  >
    <div class="flex items-baseline justify-between">
      <component
        :is="headingTag"
        class="font-display font-bold text-highlighted"
        :class="headingTag === 'h2' ? 'text-xl' : 'text-base'"
      >
        {{ heading }}
      </component>
      <ULink
        v-if="showSeeAll"
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
        <NuxtLink
          :to="titlePath(item.title)"
          :title="item.caption ? `${item.title.name} · ${item.caption}` : item.title.name"
          class="group block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <MediaPosterImage
            :title="item.title"
            :progress="item.progress"
            sizes="10rem"
          />
          <p class="mt-2 line-clamp-2 text-sm font-medium text-highlighted group-hover:text-primary">
            {{ item.title.name }}
          </p>
          <p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <MediaTypeTag :type="item.title.type" />
            <span class="truncate">{{ item.caption }}</span>
          </p>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
