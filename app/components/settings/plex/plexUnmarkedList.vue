<script setup lang="ts">
import type { PlexUnmarkedItem } from '~/types/plex'

const toast = useToast()
const showApiError = useApiErrorToast()
const items = ref<PlexUnmarkedItem[]>()
const loadFailed = ref(false)
const restoringIds = ref(new Set<number>())
const heading = useTemplateRef<HTMLHeadingElement>('heading')
const list = useTemplateRef<HTMLUListElement>('list')

const itemName = (item: PlexUnmarkedItem) => (item.episodeCode ? `${item.titleName} ${item.episodeCode}` : item.titleName)

async function refresh() {
  try {
    items.value = (await $fetch<{ items: PlexUnmarkedItem[] }>('/api/plex/unmarked')).items
    loadFailed.value = false
  } catch {
    loadFailed.value = true
  }
}

async function onRestore(item: PlexUnmarkedItem) {
  restoringIds.value.add(item.id)
  try {
    await $fetch(`/api/plex/unmarked/${item.id}/restore`, { method: 'POST' })
    const removedIndex = items.value?.findIndex(candidate => candidate.id === item.id) ?? -1
    items.value = items.value?.filter(candidate => candidate.id !== item.id)
    await nextTick()
    focusAfterRemoving(removedIndex)
    toast.add({ title: `Restored ${itemName(item)}`, description: 'Its plays are back in watchd.', color: 'success' })
  } catch (error) {
    showApiError(error, 'Couldn\'t restore', 'Try again in a moment.')
  } finally {
    restoringIds.value.delete(item.id)
  }
}

function focusAfterRemoving(removedIndex: number) {
  const remainingButtons = [...(list.value?.querySelectorAll<HTMLButtonElement>('[data-restore-button]') ?? [])]
  const nextButton = remainingButtons[Math.min(removedIndex, remainingButtons.length - 1)]
  if (nextButton) nextButton.focus()
  else heading.value?.focus()
}

onMounted(refresh)

defineExpose({ refresh })
</script>

<template>
  <section
    v-if="items || loadFailed"
    aria-labelledby="plex-unmarked-title"
  >
    <UPageCard>
      <div class="flex flex-col gap-1">
        <h2
          id="plex-unmarked-title"
          ref="heading"
          tabindex="-1"
          class="font-display text-lg font-bold text-highlighted outline-none"
        >
          Unmarked in Plex
        </h2>
        <p class="max-w-prose text-sm text-muted">
          Marking something unwatched in Plex hides its plays here too. They're kept for 30 days in case it was a misclick.
        </p>
      </div>

      <p
        v-if="loadFailed"
        role="alert"
        class="text-sm text-error"
      >
        Couldn't load what was unmarked in Plex. Reload the page to try again.
      </p>
      <p
        v-if="items && !items.length"
        class="text-sm text-muted"
      >
        Nothing has been unmarked in Plex.
      </p>
      <ul
        v-else-if="items"
        ref="list"
        class="flex flex-col divide-y divide-default"
      >
        <li
          v-for="item in items"
          :key="item.id"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
        >
          <div class="flex min-w-0 flex-1 basis-48 flex-col">
            <span class="break-words font-medium text-highlighted">{{ itemName(item) }}</span>
            <span class="text-sm text-muted tabular-nums">
              {{ item.plays === 1 ? '1 play' : `${item.plays.toLocaleString('en')} plays` }},
              {{ item.daysLeft === 1 ? '1 day left' : `${item.daysLeft} days left` }}
            </span>
          </div>
          <UButton
            data-restore-button
            label="Restore"
            icon="i-lucide-undo-2"
            variant="outline"
            color="neutral"
            size="sm"
            :aria-label="`Restore ${itemName(item)}`"
            :loading="restoringIds.has(item.id)"
            @click="onRestore(item)"
          />
        </li>
      </ul>
    </UPageCard>
  </section>
</template>
