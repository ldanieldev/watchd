<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { PlexPinCheck, PlexSyncModeSetting } from '~/types/plex'

const PIN_POLL_INTERVAL_MS = 1000
const PIN_POLL_LIMIT_MS = 2 * 60 * 1000

const props = defineProps<{
  mode: PlexSyncModeSetting
  returningPinId?: number
  signInRejected?: boolean
}>()

const emit = defineEmits<{ connected: [serverName: string] }>()

type SignInPhase = 'idle' | 'starting' | 'waiting' | 'picking' | 'connecting' | 'timed-out' | 'failed'
type OwnedServer = Extract<PlexPinCheck, { state: 'signed-in' }>['servers'][number]

const phase = ref<SignInPhase>('idle')
const errorMessage = ref<string>()
const servers = ref<OwnedServer[]>([])
const chosenMachineId = ref<string>()
const serverUrlOverride = ref('')
const serverChoiceError = ref<string>()
const signInButton = useTemplateRef<ComponentPublicInstance>('signInButton')
let pollTimer: ReturnType<typeof setTimeout> | undefined
let isActive = true

const isSyncOff = computed(() => props.mode === 'off')
const signInLabel = computed(() => (props.signInRejected ? 'Sign in again' : 'Sign in with Plex'))
const serverOptions = computed(() => servers.value.map(server => ({ label: server.name, value: server.machineId })))
const isWaitingForPlex = computed(() => phase.value === 'waiting')
const showsServerForm = computed(() => (phase.value === 'picking' || phase.value === 'connecting') && servers.value.length > 0)

async function startSignIn() {
  phase.value = 'starting'
  errorMessage.value = undefined
  try {
    const { authUrl } = await $fetch<{ authUrl: string }>('/api/plex/pin', { method: 'POST' })
    await navigateTo(authUrl, { external: true })
  } catch (error) {
    errorMessage.value = extractApiErrorMessage(error, 'Couldn\'t start the Plex sign-in. Try again in a moment.')
    phase.value = 'failed'
  }
}

async function checkPin(pinId: number, deadline: number) {
  try {
    const check = await $fetch<PlexPinCheck>(`/api/plex/pin/${pinId}`)
    if (!isActive) return
    if (check.state === 'signed-in') {
      if (!check.servers.length) {
        errorMessage.value = 'This Plex account doesn\'t own a Plex server. Sign in with the account that owns it.'
        phase.value = 'failed'
        return
      }
      servers.value = check.servers
      chosenMachineId.value = check.servers.length === 1 ? check.servers[0]!.machineId : undefined
      phase.value = 'picking'
      return
    }
  } catch (error) {
    if (!isActive) return
    errorMessage.value = extractApiErrorMessage(error, 'Couldn\'t check the Plex sign-in. Sign in with Plex again.')
    phase.value = 'failed'
    return
  }
  if (Date.now() >= deadline) {
    phase.value = 'timed-out'
    return
  }
  pollTimer = setTimeout(() => checkPin(pinId, deadline), PIN_POLL_INTERVAL_MS)
}

async function onConnect() {
  if (props.returningPinId === undefined) return
  if (!chosenMachineId.value) {
    serverChoiceError.value = 'Pick the server to connect.'
    return
  }
  serverChoiceError.value = undefined
  errorMessage.value = undefined
  phase.value = 'connecting'
  const override = serverUrlOverride.value.trim()
  try {
    const { serverName } = await $fetch<{ serverName: string }>('/api/plex/connect', {
      method: 'POST',
      body: { pinId: props.returningPinId, machineId: chosenMachineId.value, ...(override && { serverUrlOverride: override }) }
    })
    emit('connected', serverName)
  } catch (error) {
    errorMessage.value = extractApiErrorMessage(error, 'Couldn\'t connect to the Plex server. Try again in a moment.')
    phase.value = 'picking'
  }
}

onMounted(() => {
  if (props.returningPinId === undefined) return
  phase.value = 'waiting'
  checkPin(props.returningPinId, Date.now() + PIN_POLL_LIMIT_MS)
})

onBeforeUnmount(() => {
  isActive = false
  clearTimeout(pollTimer)
})

defineExpose({ focusSignIn: () => (signInButton.value?.$el as HTMLElement | undefined)?.focus() })
</script>

<template>
  <section aria-labelledby="plex-connect-title">
    <UPageCard>
      <div class="flex flex-col gap-1">
        <h2
          id="plex-connect-title"
          class="font-display text-lg font-bold text-highlighted"
        >
          Plex
        </h2>
        <p
          v-if="signInRejected"
          class="max-w-prose text-sm text-muted"
        >
          Plex no longer accepts watchd's sign-in, so syncing has stopped. Sign in again to pick up where it left off.
        </p>
        <p
          v-else
          class="max-w-prose text-sm text-muted"
        >
          Plays you finish in Plex arrive in watchd as they happen, and what you mark here is marked in Plex too. Only the server owner's plays are read.
        </p>
      </div>

      <p
        v-if="isSyncOff"
        class="max-w-prose text-sm text-highlighted"
      >
        Plex sync is off on this server. Set NUXT_PLEX_SYNC_MODE to read-only or on, then restart watchd.
      </p>

      <p
        v-if="isWaitingForPlex"
        role="status"
        class="flex items-center gap-2 text-sm text-highlighted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-4 animate-spin motion-reduce:animate-none"
        />
        Waiting for Plex to confirm the sign-in…
      </p>

      <form
        v-if="showsServerForm"
        aria-labelledby="plex-connect-title"
        class="flex max-w-xl flex-col gap-5"
        novalidate
        @submit.prevent="onConnect"
      >
        <URadioGroup
          v-if="servers.length > 1"
          v-model="chosenMachineId"
          legend="Server"
          name="machineId"
          :items="serverOptions"
          :ui="{ legend: 'mb-2 text-sm font-medium text-highlighted' }"
        />
        <p
          v-else
          class="text-sm text-highlighted"
        >
          Server: <span class="font-medium">{{ servers[0]!.name }}</span>
        </p>
        <p
          v-if="serverChoiceError"
          role="alert"
          class="-mt-3 text-sm text-error"
        >
          {{ serverChoiceError }}
        </p>

        <UFormField
          label="Server URL"
          name="serverUrlOverride"
          hint="Optional"
          description="Only needed when watchd can't find the server on its own, for example http://192.168.1.20:32400."
        >
          <UInput
            v-model="serverUrlOverride"
            type="url"
            name="serverUrlOverride"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            inputmode="url"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          label="Connect"
          icon="i-lucide-plug"
          :loading="phase === 'connecting'"
          class="w-fit"
        />
      </form>

      <p
        v-if="phase === 'timed-out'"
        role="alert"
        class="text-sm text-error"
      >
        Plex didn't confirm the sign-in within 2 minutes. Sign in with Plex again.
      </p>
      <p
        v-if="errorMessage"
        role="alert"
        class="text-sm text-error"
      >
        {{ errorMessage }}
      </p>

      <UButton
        v-if="!showsServerForm && !isWaitingForPlex"
        ref="signInButton"
        :label="signInLabel"
        icon="i-simple-icons-plex"
        :loading="phase === 'starting'"
        :disabled="isSyncOff"
        class="w-fit"
        @click="startSignIn"
      />
    </UPageCard>
  </section>
</template>
