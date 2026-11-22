<script setup lang="ts">
import type { EnrichmentStatus } from '~~/shared/types/library'

const toast = useToast()
const showApiError = useApiErrorToast()
const { data: status, error: statusError, refresh: refreshStatus } = await useFetch<EnrichmentStatus>('/api/import/status')
const isRetrying = ref(false)
const isRefreshing = ref(false)

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

async function onRefreshLibrary() {
  isRefreshing.value = true
  try {
    const { queued } = await $fetch<{ queued: number }>('/api/maintenance/refresh-library', { method: 'POST' })
    if (queued === 0) {
      toast.add({ title: 'Nothing to refresh', description: 'Your library has no titles yet.', color: 'neutral' })
    } else {
      toast.add({
        title: `Refreshing ${queued.toLocaleString('en')} ${queued === 1 ? 'title' : 'titles'}`,
        description: 'They update in the background over the next few minutes.',
        color: 'success'
      })
    }
    await refreshStatus()
  } catch (error) {
    showApiError(error, 'Couldn\'t refresh the library', 'Try again in a moment.')
  } finally {
    isRefreshing.value = false
  }
}
</script>

<template>
  <section aria-labelledby="maintenance-metadata-title">
    <UPageCard>
      <div class="flex flex-col gap-1">
        <h2
          id="maintenance-metadata-title"
          class="font-display text-lg font-bold text-highlighted"
        >
          Metadata
        </h2>
        <p class="max-w-prose text-sm text-muted">
          Posters, episodes and cast come from TMDB. Still-airing shows refresh every morning; refresh everything here when something looks out of date.
        </p>
      </div>

      <p
        v-if="status"
        role="status"
        class="text-sm tabular-nums text-highlighted"
      >
        {{ status.ready.toLocaleString('en') }} ready · {{ status.pending.toLocaleString('en') }} pending · {{ status.failed.toLocaleString('en') }} failed
      </p>
      <p
        v-else-if="statusError"
        class="text-sm text-error"
      >
        Couldn't load metadata status
      </p>

      <div class="flex flex-wrap items-center gap-3">
        <UButton
          v-if="status && status.failed > 0"
          label="Retry failed"
          icon="i-lucide-rotate-cw"
          variant="outline"
          color="neutral"
          size="sm"
          :loading="isRetrying"
          @click="onRetry"
        />
        <UButton
          label="Refresh whole library"
          icon="i-lucide-refresh-cw"
          variant="outline"
          color="neutral"
          size="sm"
          :loading="isRefreshing"
          @click="onRefreshLibrary"
        />
      </div>
    </UPageCard>
  </section>
</template>
