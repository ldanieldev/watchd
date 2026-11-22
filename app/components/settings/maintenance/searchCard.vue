<script setup lang="ts">
const toast = useToast()
const showApiError = useApiErrorToast()
const isRebuilding = ref(false)

async function onRebuild() {
  isRebuilding.value = true
  try {
    await $fetch('/api/maintenance/rebuild-search', { method: 'POST' })
    toast.add({ title: 'Rebuilding search', description: 'Search results update in a few seconds.', color: 'success' })
  } catch (error) {
    showApiError(error, 'Couldn\'t rebuild search', 'Try again in a moment.')
  } finally {
    isRebuilding.value = false
  }
}
</script>

<template>
  <section aria-labelledby="maintenance-search-title">
    <UPageCard>
      <div class="flex flex-col gap-1">
        <h2
          id="maintenance-search-title"
          class="font-display text-lg font-bold text-highlighted"
        >
          Search
        </h2>
        <p class="max-w-prose text-sm text-muted">
          The search index rebuilds itself after every change and nightly. Rebuild it now if search is missing titles.
        </p>
      </div>

      <div>
        <UButton
          label="Rebuild search index"
          icon="i-lucide-search"
          variant="outline"
          color="neutral"
          size="sm"
          :loading="isRebuilding"
          @click="onRebuild"
        />
      </div>
    </UPageCard>
  </section>
</template>
