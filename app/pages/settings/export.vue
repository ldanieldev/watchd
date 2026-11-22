<script setup lang="ts">
useHead({ title: 'Export data' })

const { data: summary, error: summaryError } = await useFetch<{ plays: number, titleSettings: number }>('/api/export/summary')

const exportUrl = `${useRequestURL({ xForwardedHost: true, xForwardedProto: true }).origin}/api/export`
const scriptExample = `curl -H "Authorization: Bearer <token>" \\
  -o watchd-backup.json \\
  ${exportUrl}`
</script>

<template>
  <div class="flex min-w-0 flex-col gap-6">
    <h1 class="sr-only">
      Export data
    </h1>
    <section aria-labelledby="export-backup-title">
      <UPageCard>
        <div class="flex flex-col gap-1">
          <h2
            id="export-backup-title"
            class="font-display text-lg font-bold text-highlighted"
          >
            Back up your library
          </h2>
          <p class="max-w-prose text-sm text-muted">
            One JSON file with every play and title setting. Restore it from Import data, on this server or a new one.
          </p>
        </div>

        <p
          v-if="summary"
          class="font-display text-2xl font-bold tabular-nums text-highlighted"
        >
          {{ summary.plays.toLocaleString('en') }} plays and {{ summary.titleSettings.toLocaleString('en') }} title settings
        </p>
        <p
          v-else-if="summaryError"
          class="text-sm text-muted"
        >
          Couldn't load the counts. The download still works.
        </p>

        <UButton
          to="/api/export"
          external
          download
          label="Download backup"
          icon="i-lucide-file-down"
          class="w-fit"
        />
      </UPageCard>
    </section>

    <section
      aria-labelledby="export-script-title"
      class="min-w-0"
    >
      <UPageCard :ui="{ container: 'min-w-0', wrapper: 'min-w-0 w-full' }">
        <div class="flex flex-col gap-1">
          <h2
            id="export-script-title"
            class="font-display text-lg font-bold text-highlighted"
          >
            Fetch it from a script
          </h2>
          <p class="max-w-prose text-sm text-muted">
            Send an access token as a bearer token to download the same file without signing in. Create one under
            <ULink
              to="/settings/advanced"
              class="text-highlighted underline"
            >Advanced</ULink>.
          </p>
        </div>
        <pre class="overflow-x-auto whitespace-pre rounded-md bg-elevated p-3 text-sm"><code>{{ scriptExample }}</code></pre>
      </UPageCard>
    </section>
  </div>
</template>
