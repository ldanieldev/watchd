<script setup lang="ts">
import type { CacheBackend } from '~~/shared/types/maintenance'

const BACKEND_STATUS_LINES: Record<CacheBackend, string> = {
  'redis': 'Redis connected',
  'memory-fallback': 'Redis unreachable, using in-memory cache',
  'memory': 'In-memory cache (no Redis configured)'
}

const toast = useToast()
const showApiError = useApiErrorToast()
const { data: cache, error: cacheError } = await useFetch<{ backend: CacheBackend }>('/api/maintenance/cache')
const isClearing = ref(false)

async function onClear() {
  isClearing.value = true
  try {
    const { removed, backend } = await $fetch<{ removed: number, backend: CacheBackend }>('/api/maintenance/clear-people-cache', { method: 'POST' })
    toast.add({
      title: `Cleared ${removed.toLocaleString('en')} cached ${removed === 1 ? 'person' : 'people'}`,
      description: backend === 'memory-fallback' ? 'Redis is unreachable, so entries stored there remain.' : undefined,
      color: 'success'
    })
  } catch (error) {
    showApiError(error, 'Couldn\'t clear the cache', 'Try again in a moment.')
  } finally {
    isClearing.value = false
  }
}
</script>

<template>
  <section aria-labelledby="maintenance-cache-title">
    <UPageCard>
      <div class="flex flex-col gap-1">
        <h2
          id="maintenance-cache-title"
          class="font-display text-lg font-bold text-highlighted"
        >
          Cache
        </h2>
        <p
          v-if="cache"
          role="status"
          class="text-sm text-highlighted"
        >
          {{ BACKEND_STATUS_LINES[cache.backend] }}
        </p>
        <p
          v-else-if="cacheError"
          class="text-sm text-error"
        >
          Couldn't load cache status
        </p>
        <p class="max-w-prose text-sm text-muted">
          Cast and crew pages are cached for a week.
        </p>
      </div>

      <div>
        <UButton
          label="Clear people cache"
          icon="i-lucide-trash-2"
          variant="outline"
          color="neutral"
          size="sm"
          :loading="isClearing"
          @click="onClear"
        />
      </div>
    </UPageCard>
  </section>
</template>
