<script setup lang="ts">
import type { StatWatch } from '~/utils/library/stats'
import { episodeCode } from '~/utils/library/derive'
import { parseIsoDate } from '~/utils/library/dates'
import { titlePath } from '~/utils/library/paths'
import { tmdbImage } from '~/utils/library/tmdb'

const props = defineProps<{
  label: string
  watch: StatWatch
}>()

const image = computed(() => props.watch.title.backdropPath ?? props.watch.title.posterPath)
const detail = computed(() => {
  const date = parseIsoDate(props.watch.date).toLocaleString('en', { month: 'short', day: 'numeric', year: 'numeric' })
  return props.watch.episode ? `${episodeCode(props.watch.title, props.watch.episode)} · ${date}` : date
})
</script>

<template>
  <NuxtLink
    :to="titlePath(watch.title)"
    class="group relative isolate flex min-h-28 flex-col justify-end overflow-hidden rounded-xl bg-elevated p-3 ring-1 ring-default hover:ring-primary"
  >
    <img
      :src="tmdbImage(image, 'w780')"
      alt=""
      loading="lazy"
      class="absolute inset-0 -z-10 size-full object-cover transition group-hover:scale-105"
    >
    <div class="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/40 to-transparent" />
    <span class="text-[0.625rem] font-semibold tracking-wider text-white/75 uppercase">{{ label }}</span>
    <span
      class="truncate text-sm font-semibold text-white"
      :title="watch.title.name"
    >{{ watch.title.name }}</span>
    <span class="text-xs text-white/75">{{ detail }}</span>
  </NuxtLink>
</template>
