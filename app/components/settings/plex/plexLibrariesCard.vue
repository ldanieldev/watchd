<script setup lang="ts">
import type { PlexConnectedStatus } from '~/types/plex'

const props = defineProps<{
  serverName: string
  sections: PlexConnectedStatus['sections']
  sectionsAvailable: boolean
}>()

const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const showApiError = useApiErrorToast()
const isSaving = ref(false)
const checkedSectionIds = ref<string[]>([])

const savedSectionIds = computed(() => props.sections.filter(section => section.checked).map(section => section.id))
const libraryOptions = computed(() => props.sections.map(section => ({
  label: section.title,
  description: section.type === 'movie' ? 'Movie library' : 'Show library',
  value: section.id
})))
const hasChanges = computed(() => {
  const saved = new Set(savedSectionIds.value)
  return checkedSectionIds.value.length !== saved.size || checkedSectionIds.value.some(id => !saved.has(id))
})

watch(savedSectionIds, (sectionIds) => {
  checkedSectionIds.value = [...sectionIds]
}, { immediate: true })

async function onSave() {
  isSaving.value = true
  try {
    await $fetch('/api/plex/libraries', { method: 'PUT', body: { sectionIds: checkedSectionIds.value } })
    toast.add({ title: 'Libraries saved', color: 'success' })
    emit('saved')
  } catch (error) {
    showApiError(error, 'Couldn\'t save libraries', 'Try again in a moment.')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <section aria-labelledby="plex-libraries-title">
    <UPageCard>
      <div class="flex flex-col gap-1">
        <h2
          id="plex-libraries-title"
          class="font-display text-lg font-bold text-highlighted"
        >
          Libraries
        </h2>
        <p class="max-w-prose text-sm text-muted">
          Only checked libraries are scanned, synced and listened to. Personal media libraries start unchecked.
        </p>
      </div>

      <p
        v-if="!sectionsAvailable"
        role="alert"
        class="text-sm text-error"
      >
        Couldn't reach {{ serverName }} to list its libraries. Try again once it's back online.
      </p>
      <p
        v-else-if="!sections.length"
        class="text-sm text-muted"
      >
        {{ serverName }} has no movie or show libraries.
      </p>

      <form
        v-else
        aria-labelledby="plex-libraries-title"
        class="flex flex-col gap-4"
        @submit.prevent="onSave"
      >
        <UCheckboxGroup
          v-model="checkedSectionIds"
          legend="Libraries to sync"
          name="sectionIds"
          :items="libraryOptions"
          :ui="{ legend: 'sr-only', fieldset: 'gap-3' }"
        />
        <UButton
          type="submit"
          label="Save libraries"
          :loading="isSaving"
          :disabled="!hasChanges"
          class="w-fit"
        />
      </form>
    </UPageCard>
  </section>
</template>
