<script setup lang="ts">
import type { PlexJob, PlexStatus } from '~/types/plex'

const JOB_POLL_INTERVAL_MS = 5000
const JOB_POLL_LIMIT_MS = 3 * 60 * 1000

useHead({ title: 'Integrations' })

const route = useRoute()
const router = useRouter()
const status = ref<PlexStatus>()
const statusLoadFailed = ref(false)
const runningJob = ref<PlexJob>()
const connectCard = useTemplateRef<{ focusSignIn: () => void }>('connectCard')
const statusCard = useTemplateRef<{ focusHeading: () => void }>('statusCard')
const unmarkedList = useTemplateRef<{ refresh: () => Promise<void> }>('unmarkedList')
const unmatchedList = useTemplateRef<{ refresh: () => Promise<void> }>('unmatchedList')
let jobPollTimer: ReturnType<typeof setTimeout> | undefined
let isPageActive = true

const returningPinId = computed(() => {
  const pin = Number(Array.isArray(route.query.pin) ? route.query.pin[0] : route.query.pin)
  return Number.isInteger(pin) && pin > 0 ? pin : undefined
})
const connectedStatus = computed(() => (status.value?.connected ? status.value : undefined))
const showsConnectCard = computed(() => !connectedStatus.value || connectedStatus.value.tokenInvalid || returningPinId.value !== undefined)

async function refreshStatus() {
  try {
    status.value = await $fetch<PlexStatus>('/api/plex/status')
    statusLoadFailed.value = false
  } catch {
    if (!status.value) statusLoadFailed.value = true
  }
}

async function refreshLists() {
  await Promise.all([unmarkedList.value?.refresh(), unmatchedList.value?.refresh()])
}

async function refreshAll() {
  await Promise.all([refreshStatus(), refreshLists()])
}

const jobFinishMarker = (job: PlexJob) => (job === 'scan' ? connectedStatus.value?.lastScanAt : connectedStatus.value?.report?.finishedAt) ?? null

function stopJobPolling() {
  clearTimeout(jobPollTimer)
  runningJob.value = undefined
}

function onJobQueued(job: PlexJob) {
  clearTimeout(jobPollTimer)
  runningJob.value = job
  const markerWhenQueued = jobFinishMarker(job)
  const deadline = Date.now() + JOB_POLL_LIMIT_MS
  const checkJob = async () => {
    if (document.visibilityState === 'visible') {
      await refreshStatus()
      if (!isPageActive) return
      if (jobFinishMarker(job) !== markerWhenQueued) {
        stopJobPolling()
        await refreshLists()
        return
      }
    }
    if (Date.now() >= deadline) {
      stopJobPolling()
      return
    }
    jobPollTimer = setTimeout(checkJob, JOB_POLL_INTERVAL_MS)
  }
  jobPollTimer = setTimeout(checkJob, JOB_POLL_INTERVAL_MS)
}

async function onConnected() {
  await refreshStatus()
  const { pin: _pin, ...query } = route.query
  await router.replace({ query })
  await nextTick()
  statusCard.value?.focusHeading()
}

async function onDisconnected() {
  stopJobPolling()
  await refreshStatus()
  await nextTick()
  connectCard.value?.focusSignIn()
}

onMounted(refreshStatus)
onBeforeUnmount(() => {
  isPageActive = false
  clearTimeout(jobPollTimer)
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="sr-only">
      Integrations
    </h1>

    <p
      v-if="statusLoadFailed"
      role="alert"
      class="text-sm text-error"
    >
      Couldn't load the Plex connection. Reload the page to try again.
    </p>
    <USkeleton
      v-else-if="!status"
      class="h-48 w-full rounded-lg"
    />

    <template v-if="status">
      <SettingsPlexConnectCard
        v-if="showsConnectCard"
        ref="connectCard"
        :key="returningPinId ?? 'start'"
        :mode="status.mode"
        :returning-pin-id="returningPinId"
        :sign-in-rejected="connectedStatus?.tokenInvalid"
        @connected="onConnected"
      />
      <template v-if="connectedStatus">
        <SettingsPlexStatusCard
          ref="statusCard"
          :status="connectedStatus"
          :running-job="runningJob"
          @queued="onJobQueued"
          @disconnected="onDisconnected"
        />
        <SettingsPlexLibrariesCard
          :server-name="connectedStatus.serverName"
          :sections="connectedStatus.sections"
          :sections-available="connectedStatus.sectionsAvailable"
          @saved="refreshAll"
        />
        <SettingsPlexUnmarkedList ref="unmarkedList" />
        <SettingsPlexUnmatchedList ref="unmatchedList" />
      </template>
    </template>
  </div>
</template>
