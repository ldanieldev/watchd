<script setup lang="ts">
import type { Release } from '~~/shared/utils/library/types'
import { episodeCode } from '~~/shared/utils/library/derive'
import { mediaTypeStyles } from '~/utils/library/mediaTypes'
import { tmdbImage } from '~/utils/library/tmdb'

defineProps<{ release: Release }>()
</script>

<template>
  <div
    :title="release.title.name"
    class="flex items-center gap-3"
  >
    <img
      width="92"
      height="138"
      :src="tmdbImage(release.title.posterPath, 'w92')"
      alt=""
      loading="lazy"
      class="h-15 w-10 shrink-0 rounded object-cover"
    >
    <div class="min-w-0">
      <p
        class="line-clamp-2 text-sm font-medium"
        :class="release.watched ? 'text-muted line-through' : 'text-highlighted'"
      >
        {{ release.title.name }}
      </p>
      <p class="mt-0.5 text-xs text-muted">
        {{ release.episode ? episodeCode(release.title, release.episode) : 'Release' }},
        {{ mediaTypeStyles[release.title.type].label }}
      </p>
    </div>
  </div>
</template>
