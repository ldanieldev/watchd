<script setup lang="ts">
import type { TitleSummary, WeekDay } from '~~/shared/utils/library/types'
import { episodeCode } from '~~/shared/utils/library/derive'
import { titlePath } from '~/utils/library/paths'
import { tmdbImage } from '~/utils/library/tmdb'

const props = defineProps<{
  upNext?: TitleSummary
  week: WeekDay[]
}>()

const emit = defineEmits<{ markWatched: [summary: TitleSummary] }>()

const behindLabel = computed(() => {
  const count = props.upNext?.newCount ?? 0
  return count === 1 ? 'You\'re one episode behind.' : `You're ${count} episodes behind.`
})
</script>

<template>
  <section
    v-if="upNext && upNext.nextEpisode"
    class="relative isolate overflow-hidden rounded-xl bg-elevated"
    aria-labelledby="hero-title"
  >
    <img
      v-if="upNext.title.backdropPath"
      width="1280"
      height="720"
      :src="tmdbImage(upNext.title.backdropPath, 'w1280')"
      :srcset="`${tmdbImage(upNext.title.backdropPath, 'w780')} 780w, ${tmdbImage(upNext.title.backdropPath, 'w1280')} 1280w`"
      sizes="(min-width: 1024px) 70vw, 100vw"
      alt=""
      fetchpriority="high"
      class="absolute inset-0 -z-10 size-full object-cover object-top"
    >
    <div class="absolute inset-0 -z-10 bg-linear-to-r from-(--ui-bg) via-(--ui-bg)/70 to-transparent" />
    <div class="absolute inset-0 -z-10 bg-linear-to-t from-(--ui-bg)/90 via-transparent to-transparent" />

    <div class="flex min-h-[26rem] flex-col justify-between gap-10 p-5 sm:p-8">
      <div class="flex max-w-xl flex-col gap-3">
        <p class="text-sm font-medium text-toned">
          Up next, {{ episodeCode(upNext.title, upNext.nextEpisode) }}
        </p>
        <h2
          id="hero-title"
          class="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-highlighted text-balance sm:text-5xl lg:text-6xl"
        >
          {{ upNext.title.name }}
        </h2>
        <p class="text-sm text-toned">
          {{ behindLabel }}
        </p>
        <div class="mt-1 flex flex-wrap gap-2">
          <UButton
            label="Mark watched"
            icon="i-lucide-check"
            variant="solid"
            size="lg"
            class="rounded-full"
            @click="emit('markWatched', upNext)"
          />
          <UButton
            label="Details"
            :to="titlePath(upNext.title)"
            color="neutral"
            variant="ghost"
            size="lg"
            class="rounded-full"
          />
        </div>
      </div>

      <MediaWeekStrip
        :days="week"
        overlay
      />
    </div>
  </section>

  <section
    v-else
    class="flex flex-col gap-3"
    aria-labelledby="week-title"
  >
    <h2
      id="week-title"
      class="font-display text-xl font-bold text-highlighted"
    >
      This week
    </h2>
    <MediaWeekStrip :days="week" />
  </section>
</template>
