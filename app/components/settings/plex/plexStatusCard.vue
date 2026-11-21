<script setup lang="ts">
import type { PlexConnectedStatus, PlexJob } from '~/types/plex'

const props = defineProps<{ status: PlexConnectedStatus, runningJob?: PlexJob }>()
const emit = defineEmits<{ queued: [job: PlexJob], disconnected: [] }>()

const toast = useToast()
const showApiError = useApiErrorToast()
const queueingJob = ref<PlexJob>()
const heading = useTemplateRef<HTMLHeadingElement>('heading')
const isDisconnectOpen = ref(false)

const timestampFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const formatTimestamp = (value: string | number | null) => (value === null ? undefined : timestampFormatter.format(new Date(value)))

const modeLabels = { 'on': 'Two-way', 'read-only': 'Read-only', 'off': 'Off' } as const
const listenerLabels = { connected: 'Listening for plays', reconnecting: 'Reconnecting to Plex', error: 'Not listening, the connection failed' } as const

const listenerState = computed(() => props.status.listener?.state ?? 'stopped')
const listenerLabel = computed(() => (props.status.listener ? listenerLabels[props.status.listener.state] : 'Not listening'))
const listenerSince = computed(() => formatTimestamp(props.status.listener?.since ?? null))
const report = computed(() => props.status.report)
const reportFigures = computed(() => {
  if (!report.value) return []
  const { pulled, pushed, unmatched, errors } = report.value
  return [
    { label: 'Plays added', value: pulled.added },
    { label: 'Already in watchd', value: pulled.duplicates },
    { label: 'Waiting for a match', value: pulled.unresolved },
    { label: 'Sent to Plex', value: pushed },
    { label: 'Not matched', value: unmatched.noTmdbGuid + unmatched.episodeNotInTmdb },
    { label: 'Errors', value: errors }
  ]
})

const runningJobLabels = { scan: 'Scanning Plex…', reconcile: 'Reconciling with Plex…' } as const

async function queue(job: PlexJob, queuedTitle: string, failedTitle: string) {
  queueingJob.value = job
  try {
    await $fetch(`/api/plex/${job}`, { method: 'POST' })
    toast.add({ title: queuedTitle, description: 'It runs in the background; this page updates when it finishes.', color: 'success' })
    emit('queued', job)
  } catch (error) {
    showApiError(error, failedTitle, 'Try again in a moment.')
  } finally {
    queueingJob.value = undefined
  }
}

const isJobBusy = (job: PlexJob) => queueingJob.value === job || props.runningJob === job

async function onDisconnect() {
  try {
    await $fetch('/api/plex/connection', { method: 'DELETE' })
  } catch (error) {
    showApiError(error, 'Couldn\'t disconnect', 'Try again in a moment.')
    return
  }
  isDisconnectOpen.value = false
  toast.add({ title: 'Plex disconnected', color: 'success' })
  emit('disconnected')
}

defineExpose({ focusHeading: () => heading.value?.focus() })
</script>

<template>
  <section aria-labelledby="plex-status-title">
    <UPageCard>
      <div class="flex flex-col gap-2">
        <h2
          id="plex-status-title"
          ref="heading"
          tabindex="-1"
          class="font-display text-lg font-bold text-highlighted outline-none"
        >
          Plex
        </h2>
        <p class="font-display text-2xl font-bold break-words text-highlighted sm:text-3xl">
          Connected to {{ status.serverName }}
        </p>
        <p class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-highlighted">
          <span
            class="plex-listener-dot"
            :data-state="listenerState"
            aria-hidden="true"
          />
          {{ listenerLabel }}
          <span
            v-if="listenerSince"
            class="text-muted"
          >since {{ listenerSince }}</span>
        </p>
        <p
          v-if="status.mode === 'read-only'"
          class="flex w-fit items-center gap-1.5 rounded-md bg-elevated px-2 py-1 text-sm text-toned"
        >
          <UIcon
            name="i-lucide-eye"
            class="size-4 shrink-0"
          />
          Read-only: watchd isn't changing Plex
        </p>
      </div>

      <dl class="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-[auto_1fr_1fr]">
        <div class="flex flex-col">
          <dt class="text-sm text-muted">
            Sync
          </dt>
          <dd class="text-highlighted">
            {{ modeLabels[status.mode] }}
          </dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-sm text-muted">
            Last play received
          </dt>
          <dd class="text-highlighted tabular-nums">
            {{ formatTimestamp(status.lastPlayAt) ?? 'None yet' }}
          </dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-sm text-muted">
            Last scan
          </dt>
          <dd class="text-highlighted tabular-nums">
            {{ formatTimestamp(status.lastScanAt) ?? 'Not yet' }}
          </dd>
        </div>
      </dl>

      <div
        v-if="report"
        class="flex flex-col gap-2"
      >
        <h3 class="text-sm font-medium text-highlighted">
          Last reconcile, {{ formatTimestamp(report.finishedAt) }}
        </h3>
        <dl class="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
          <div
            v-for="figure in reportFigures"
            :key="figure.label"
            class="flex flex-col"
          >
            <dt class="text-sm text-muted">
              {{ figure.label }}
            </dt>
            <dd class="font-display text-xl font-bold tabular-nums text-highlighted">
              {{ figure.value.toLocaleString('en') }}
            </dd>
          </div>
        </dl>
      </div>

      <div class="flex flex-col gap-3">
        <p
          role="status"
          class="flex items-center gap-2 text-sm text-muted empty:hidden"
        >
          <template v-if="runningJob">
            <UIcon
              name="i-lucide-loader-circle"
              class="size-4 animate-spin motion-reduce:animate-none"
            />
            {{ runningJobLabels[runningJob] }}
          </template>
        </p>
        <div class="flex flex-wrap gap-3">
          <UButton
            label="Scan now"
            icon="i-lucide-refresh-cw"
            :loading="isJobBusy('scan')"
            @click="queue('scan', 'Scan started', 'Couldn\'t start the scan')"
          />
          <UButton
            label="Re-run reconcile"
            icon="i-lucide-git-compare-arrows"
            variant="outline"
            color="neutral"
            :loading="isJobBusy('reconcile')"
            @click="queue('reconcile', 'Reconcile started', 'Couldn\'t start the reconcile')"
          />
          <UButton
            label="Disconnect"
            icon="i-lucide-unplug"
            variant="ghost"
            color="error"
            @click="isDisconnectOpen = true"
          />
        </div>
      </div>
    </UPageCard>

    <UModal
      v-model:open="isDisconnectOpen"
      title="Disconnect Plex?"
      :description="`watchd stops listening to ${status.serverName} and forgets its libraries and item matches. Plays already in watchd stay, and plays hidden because you unmarked them in Plex come back.`"
      :ui="{ footer: 'justify-end' }"
    >
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="soft"
          @click="isDisconnectOpen = false"
        />
        <UButton
          label="Disconnect"
          color="error"
          loading-auto
          @click="onDisconnect"
        />
      </template>
    </UModal>
  </section>
</template>

<style scoped>
.plex-listener-dot {
  inline-size: 0.5rem;
  block-size: 0.5rem;
  border-radius: 1e5px;
  flex-shrink: 0;
  background: var(--ui-text-dimmed);
}

.plex-listener-dot[data-state='connected'] {
  background: var(--ui-success);
  box-shadow: 0 0 0 0.2rem color-mix(in oklab, var(--ui-success) 25%, transparent);
}

.plex-listener-dot[data-state='reconnecting'] {
  background: var(--ui-warning);
}

.plex-listener-dot[data-state='error'] {
  background: var(--ui-error);
}
</style>
