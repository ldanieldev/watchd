<script setup lang="ts">
import type { ImportSummary } from '~~/shared/types/library'

const props = defineProps<{
  source: 'floppy' | 'trakt' | 'watchd'
  label: string
  description: string
  accept: string
  fileHint: string
  multiple?: boolean
  actionLabel?: string
}>()

const emit = defineEmits<{ imported: [summary: ImportSummary] }>()

const files = ref<File | File[] | null>(null)
const isImporting = ref(false)
const summary = ref<ImportSummary>()
const errorMessage = ref<string>()

const chosenFiles = computed(() => (files.value === null ? [] : Array.isArray(files.value) ? files.value : [files.value]))

async function onImport() {
  if (!chosenFiles.value.length) return
  const body = new FormData()
  for (const file of chosenFiles.value) body.append('file', file, file.name)
  isImporting.value = true
  errorMessage.value = undefined
  summary.value = undefined
  try {
    summary.value = await $fetch<ImportSummary>(`/api/import/${props.source}`, { method: 'POST', body })
    files.value = null
    emit('imported', summary.value)
  } catch (error) {
    errorMessage.value = extractApiErrorMessage(error, 'The import didn\'t finish. Check your connection and try again.')
  } finally {
    isImporting.value = false
  }
}
</script>

<template>
  <section :aria-labelledby="`import-${source}-title`">
    <UPageCard>
      <div class="flex flex-col gap-1">
        <h2
          :id="`import-${source}-title`"
          class="font-display text-lg font-bold text-highlighted"
        >
          {{ label }}
        </h2>
        <p class="max-w-prose text-sm text-muted">
          {{ description }}
        </p>
      </div>

      <div class="flex max-w-xl flex-col gap-3">
        <UFileUpload
          v-model="files"
          :accept="accept"
          :multiple="multiple"
          :label="multiple ? 'Drop files here or choose them' : 'Drop the file here or choose it'"
          :description="fileHint"
          layout="list"
          :disabled="isImporting"
          class="w-full"
          :ui="{ base: 'min-h-32' }"
        />
        <UButton
          :label="actionLabel ?? 'Import plays'"
          icon="i-lucide-file-up"
          :loading="isImporting"
          :disabled="!chosenFiles.length"
          class="w-fit"
          @click="onImport"
        />
      </div>

      <p
        v-if="errorMessage"
        role="alert"
        class="text-sm text-error"
      >
        {{ errorMessage }}
      </p>

      <div
        v-if="summary"
        role="status"
        class="flex flex-col gap-3"
      >
        <dl class="flex flex-wrap gap-x-8 gap-y-2">
          <div class="flex flex-col">
            <dt class="text-sm text-muted">
              Added
            </dt>
            <dd class="font-display text-2xl font-bold tabular-nums text-highlighted">
              {{ summary.added.toLocaleString('en') }}
            </dd>
          </div>
          <div class="flex flex-col">
            <dt class="text-sm text-muted">
              Already in watchd
            </dt>
            <dd class="font-display text-2xl font-bold tabular-nums text-highlighted">
              {{ summary.duplicates.toLocaleString('en') }}
            </dd>
          </div>
          <div class="flex flex-col">
            <dt class="text-sm text-muted">
              Skipped
            </dt>
            <dd class="font-display text-2xl font-bold tabular-nums text-highlighted">
              {{ summary.skipped.length.toLocaleString('en') }}
            </dd>
          </div>
          <div
            v-if="summary.titleSettings"
            class="flex flex-col"
          >
            <dt class="text-sm text-muted">
              Title settings added
            </dt>
            <dd class="font-display text-2xl font-bold tabular-nums text-highlighted">
              {{ summary.titleSettings.added.toLocaleString('en') }}
            </dd>
          </div>
          <div
            v-if="summary.titleSettings"
            class="flex flex-col"
          >
            <dt class="text-sm text-muted">
              Title settings already set
            </dt>
            <dd class="font-display text-2xl font-bold tabular-nums text-highlighted">
              {{ summary.titleSettings.alreadySet.toLocaleString('en') }}
            </dd>
          </div>
        </dl>
        <details
          v-if="summary.skipped.length"
          class="group text-sm"
        >
          <summary class="cursor-pointer text-muted hover:text-highlighted">
            Show skipped rows
          </summary>
          <ul class="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto pe-2">
            <li
              v-for="(row, index) in summary.skipped"
              :key="`${index}-${row.line}-${row.title}`"
              class="break-words"
            >
              Row {{ row.line }}: {{ row.title }} ({{ row.reason }})
            </li>
          </ul>
        </details>
      </div>
    </UPageCard>
  </section>
</template>
