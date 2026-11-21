<script setup lang="ts">
import type { Title } from '~~/shared/utils/library/types'
import { mediaTypeStyles } from '~/utils/library/mediaTypes'
import { tmdbImage } from '~/utils/library/tmdb'

const props = withDefaults(defineProps<{
  title: Title
  progress?: number
  badge?: string
  badgeTone?: 'primary' | 'neutral'
  sizes?: string
  eager?: boolean
}>(), {
  progress: undefined,
  badge: undefined,
  badgeTone: 'neutral',
  sizes: '(min-width: 1024px) 12rem, 30vw',
  eager: false
})

const failed = ref(false)
const image = useTemplateRef<HTMLImageElement>('image')

onMounted(() => {
  if (image.value?.complete && image.value.naturalWidth === 0) failed.value = true
})
const srcset = computed(() => [
  `${tmdbImage(props.title.posterPath, 'w185')} 185w`,
  `${tmdbImage(props.title.posterPath, 'w342')} 342w`,
  `${tmdbImage(props.title.posterPath, 'w500')} 500w`
].join(', '))
</script>

<template>
  <div class="relative aspect-[2/3] overflow-hidden rounded-md bg-elevated ring-1 ring-default/50">
    <div
      v-if="failed"
      class="absolute inset-0 flex items-end bg-gradient-to-b p-2 font-display text-sm font-bold leading-tight text-white"
      :class="mediaTypeStyles[title.type].fallbackClass"
    >
      {{ title.name }}
    </div>
    <img
      v-else
      ref="image"
      :src="tmdbImage(title.posterPath, 'w342')"
      :srcset="srcset"
      :sizes="sizes"
      :alt="title.name"
      width="342"
      height="513"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager ? 'high' : undefined"
      decoding="async"
      class="absolute inset-0 size-full object-cover"
      @error="failed = true"
    >
    <span
      v-if="badge"
      class="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[0.6875rem] font-semibold"
      :class="badgeTone === 'primary' ? 'bg-primary text-inverted' : 'bg-default/85 text-highlighted backdrop-blur'"
    >
      {{ badge }}
    </span>
    <div
      v-if="progress !== undefined && progress > 0 && progress < 1"
      class="absolute inset-x-0 bottom-0 h-1 bg-black/40"
    >
      <div
        class="h-full bg-primary"
        :style="{ width: `${Math.round(progress * 100)}%` }"
      />
    </div>
  </div>
</template>
