<script setup lang="ts">
import type { featuredPerson } from '~/utils/library/stats'
import { personDetailFor } from '~/utils/library/details'
import { personPath, titlePath } from '~/utils/library/paths'
import { tmdbImage } from '~/utils/library/tmdb'

const props = defineProps<{
  featured: NonNullable<ReturnType<typeof featuredPerson>>
}>()

const knownFor = computed(() => personDetailFor(props.featured.person.personId)?.knownFor)
const ringLength = computed(() => props.featured.playShare * 2 * Math.PI * 40)
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-center gap-4">
      <img
        v-if="featured.person.profilePath"
        :src="tmdbImage(featured.person.profilePath, 'w185')"
        alt=""
        class="size-20 rounded-full object-cover ring-2 ring-default"
      >
      <UIcon
        v-else
        name="i-lucide-user-round"
        class="size-20 rounded-full bg-elevated p-4 text-muted"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <NuxtLink
          :to="personPath(featured.person.personId)"
          class="font-display text-xl font-bold text-highlighted hover:text-primary"
        >
          {{ featured.person.name }}
        </NuxtLink>
        <span
          v-if="knownFor"
          class="text-sm text-muted"
        >Known for {{ knownFor.toLowerCase() }}</span>
        <dl class="mt-1 flex gap-5 text-sm">
          <div>
            <dt class="text-xs text-muted">
              Titles
            </dt>
            <dd class="font-display text-lg font-bold text-highlighted">
              {{ featured.titles.length }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              Movies
            </dt>
            <dd class="font-display text-lg font-bold text-highlighted">
              {{ featured.movies }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              Shows
            </dt>
            <dd class="font-display text-lg font-bold text-highlighted">
              {{ featured.shows }}
            </dd>
          </div>
        </dl>
      </div>
      <div class="relative size-20 shrink-0">
        <svg
          viewBox="0 0 100 100"
          class="size-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke-width="10"
            class="stroke-(--ui-bg-accented)"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke-width="10"
            stroke-linecap="round"
            class="stroke-(--ui-primary)"
            :stroke-dasharray="`${ringLength} 1000`"
          />
        </svg>
        <span class="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span class="text-sm font-bold text-highlighted">{{ Math.round(featured.playShare * 100) }}%</span>
          <span class="text-[0.625rem] text-muted">of plays</span>
        </span>
      </div>
    </div>
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3">
      <li
        v-for="title in featured.titles"
        :key="title.id"
      >
        <NuxtLink
          :to="titlePath(title)"
          class="group flex flex-col gap-1"
        >
          <MediaPosterImage
            :title="title"
            sizes="6rem"
            class="transition group-hover:ring-2 group-hover:ring-primary"
          />
          <span
            class="truncate text-xs text-default group-hover:text-primary"
            :title="title.name"
          >{{ title.name }}</span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
