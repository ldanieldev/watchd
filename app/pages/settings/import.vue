<script setup lang="ts">
useHead({ title: 'Import data' })

const progress = useTemplateRef<{ refreshStatus: () => Promise<void> }>('progress')

async function onImported() {
  await progress.value?.refreshStatus()
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="sr-only">
      Import data
    </h1>
    <SettingsImportSourceCard
      source="floppy"
      label="Floppy"
      description="Brings over every play in a Floppy export. Collections, lists and ratings are left out, and importing the same file again adds nothing twice."
      accept=".csv,text/csv"
      file-hint="The .csv file from Floppy's export"
      @imported="onImported"
    />
    <SettingsImportSourceCard
      source="trakt"
      label="Trakt"
      description="Brings over your Trakt watch history. Plays already imported from Floppy are recognised and skipped."
      accept=".zip,.json,application/zip,application/json"
      file-hint="The .zip from Trakt's data export, or its watched-history JSON files"
      multiple
      @imported="onImported"
    />
    <SettingsImportProgress ref="progress" />
  </div>
</template>
