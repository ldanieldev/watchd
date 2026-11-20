<script setup lang="ts">
import type { Title } from '~/utils/library/types'
import { tmdbImage } from '~/utils/library/tmdb'

defineProps<{ title: Title }>()
</script>

<template>
  <section
    class="relative isolate overflow-hidden rounded-xl bg-elevated"
    aria-labelledby="detail-hero-title"
  >
    <img
      v-if="title.backdropPath"
      :src="tmdbImage(title.backdropPath, 'w1280')"
      :srcset="`${tmdbImage(title.backdropPath, 'w780')} 780w, ${tmdbImage(title.backdropPath, 'w1280')} 1280w`"
      sizes="(min-width: 1024px) 70vw, 100vw"
      alt=""
      fetchpriority="high"
      class="absolute inset-0 -z-10 size-full object-cover object-top"
    >
    <div class="absolute inset-0 -z-10 bg-linear-to-r from-(--ui-bg) via-(--ui-bg)/80 to-(--ui-bg)/20" />
    <div class="absolute inset-0 -z-10 bg-linear-to-t from-(--ui-bg) via-(--ui-bg)/40 to-transparent" />

    <div class="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:gap-8 sm:p-8 sm:pt-24">
      <div class="w-28 shrink-0 shadow-lg sm:w-40 lg:w-48">
        <MediaPosterImage
          :title="title"
          sizes="(min-width: 1024px) 12rem, (min-width: 640px) 10rem, 7rem"
        />
      </div>
      <div class="flex min-w-0 max-w-2xl flex-col gap-3">
        <h1
          id="detail-hero-title"
          class="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-highlighted text-balance sm:text-5xl lg:text-6xl"
        >
          {{ title.name }}
        </h1>
        <div class="flex flex-col gap-1.5 text-sm text-toned">
          <slot name="facts" />
        </div>
        <div
          v-if="$slots.actions"
          class="mt-1 flex flex-wrap gap-2"
        >
          <slot name="actions" />
        </div>
      </div>
    </div>
  </section>
</template>
