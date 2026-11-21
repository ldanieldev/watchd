<script setup lang="ts">
import type { EnrichmentStatus } from '~~/shared/types/library'
import { LIBRARY_DATA_KEY } from '~/composables/useLibrary'

const POLL_INTERVAL_MS = 3000

const showApiError = useApiErrorToast()
const status = ref<EnrichmentStatus>()
const isRetrying = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | undefined
let isActive = true

async function refreshStatus() {
  clearTimeout(pollTimer)
  const previousPending = status.value?.pending ?? 0
  try {
    status.value = await $fetch<EnrichmentStatus>('/api/import/status')
  } catch {
    status.value = undefined
  }
  if (previousPending > 0 && status.value?.pending === 0) await refreshNuxtData(LIBRARY_DATA_KEY)
  if (isActive && status.value && status.value.pending > 0) pollTimer = setTimeout(refreshStatus, POLL_INTERVAL_MS)
}

async function onRetry() {
  isRetrying.value = true
  try {
    await $fetch('/api/import/retry-failed', { method: 'POST' })
    await refreshStatus()
  } catch (error) {
    showApiError(error, 'Couldn\'t retry', 'Try again in a moment.')
  } finally {
    isRetrying.value = false
  }
}

onMounted(refreshStatus)
onBeforeUnmount(() => {
  isActive = false
  clearTimeout(pollTimer)
})

defineExpose({ refreshStatus })
</script>

<template>
  <section
    v-if="status && status.total > 0"
    aria-labelledby="import-progress-title"
  >
    <UPageCard>
      <div class="flex flex-col gap-1">
        <h2
          id="import-progress-title"
          class="font-display text-lg font-bold text-highlighted"
        >
          Details from TMDB
        </h2>
        <p class="max-w-prose text-sm text-muted">
          Posters, episode lists and cast are fetched in the background after an import. Pages fill in as titles finish.
        </p>
      </div>

      <div class="flex max-w-xl flex-col gap-2">
        <progress
          :max="status.total"
          :value="status.ready + status.failed"
          aria-labelledby="import-progress-title"
          class="import-progress w-full"
        />
        <p
          role="status"
          class="text-sm tabular-nums text-highlighted"
        >
          <template v-if="status.ready === status.total">
            All {{ status.total.toLocaleString('en') }} titles have details
          </template>
          <template v-else>
            {{ status.ready.toLocaleString('en') }} of {{ status.total.toLocaleString('en') }} titles have details
          </template>
        </p>
      </div>

      <div
        v-if="status.failed > 0"
        class="flex flex-wrap items-center gap-3"
      >
        <p class="text-sm text-muted">
          {{ status.failed.toLocaleString('en') }} {{ status.failed === 1 ? 'title' : 'titles' }} couldn't be fetched from TMDB
        </p>
        <UButton
          label="Retry failed"
          icon="i-lucide-rotate-cw"
          variant="outline"
          color="neutral"
          size="sm"
          :loading="isRetrying"
          @click="onRetry"
        />
      </div>
    </UPageCard>
  </section>
</template>

<style scoped>
.import-progress {
  appearance: none;
  border: 0 solid;
  overflow: clip;
  block-size: 0.5rem;
  border-radius: 1e5px;
  background: var(--ui-bg-accented);
}

.import-progress::-webkit-progress-bar {
  background: transparent;
}

.import-progress::-webkit-progress-value {
  background: var(--ui-primary);
  border-radius: 1e5px;
  transition: inline-size 0.3s;
}

.import-progress::-moz-progress-bar {
  background: var(--ui-primary);
  border-radius: 1e5px;
}
</style>
