<script setup lang="ts">
import type { MediaType } from '~/utils/library/types'
import { mediaTypeStyles } from '~/utils/library/mediaTypes'

defineProps<{ type: MediaType }>()
</script>

<template>
  <span
    class="inline-flex items-center rounded px-1.5 py-px text-[0.6875rem] font-medium"
    :class="mediaTypeStyles[type].tagClass"
  >
    {{ mediaTypeStyles[type].label }}
  </span>
</template>
