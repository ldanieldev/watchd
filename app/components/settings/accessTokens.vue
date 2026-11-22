<script setup lang="ts">
import type { AccessTokenSummary } from '~~/shared/types/accessTokens'
import { relativeTimeAgo } from '~~/shared/utils/library/dates'

const MAX_NAME_LENGTH = 60

const props = defineProps<{ tokens: AccessTokenSummary[] }>()
const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const showApiError = useApiErrorToast()

const name = ref('')
const nameError = ref<string>()
const isCreating = ref(false)
const revealedToken = ref<string>()
const tokenPendingRevoke = ref<AccessTokenSummary>()
const isRevokeOpen = ref(false)

const timeZone = useLibraryTimeZone()
const timestampFormatter = computed(() => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone.value }))
const lastUsedLabel = (token: AccessTokenSummary) => (token.lastUsedAt ? `Used ${relativeTimeAgo(token.lastUsedAt, new Date())}` : 'Never used')

async function createToken() {
  nameError.value = undefined
  isCreating.value = true
  try {
    const created = await $fetch<AccessTokenSummary & { token: string }>('/api/tokens', { method: 'POST', body: { name: name.value } })
    revealedToken.value = created.token
    name.value = ''
    emit('changed')
  } catch (error) {
    nameError.value = extractApiErrorMessage(error, 'Couldn\'t create the token. Try again in a moment.')
  } finally {
    isCreating.value = false
  }
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText(revealedToken.value!)
    toast.add({ title: 'Token copied', color: 'success' })
  } catch {
    toast.add({ title: 'Couldn\'t copy', description: 'Select the token and copy it by hand.', color: 'error' })
  }
}

function askToRevoke(token: AccessTokenSummary) {
  tokenPendingRevoke.value = token
  isRevokeOpen.value = true
}

async function revokeToken() {
  const token = tokenPendingRevoke.value
  if (!token) return
  try {
    await $fetch(`/api/tokens/${token.id}`, { method: 'DELETE' })
  } catch (error) {
    showApiError(error, 'Couldn\'t revoke the token', 'Try again in a moment.')
    return
  }
  isRevokeOpen.value = false
  toast.add({ title: 'Token revoked', color: 'success' })
  emit('changed')
}
</script>

<template>
  <section aria-labelledby="access-tokens-title">
    <UPageCard>
      <div class="flex flex-col gap-1">
        <h2
          id="access-tokens-title"
          class="font-display text-lg font-bold text-highlighted"
        >
          Access tokens
        </h2>
        <p class="max-w-prose text-sm text-muted">
          A token lets a script download your backup without signing in. It works for the export only.
        </p>
      </div>

      <div
        v-if="revealedToken"
        role="status"
        class="flex flex-col gap-3 rounded-md border border-success/40 bg-success/10 p-3"
      >
        <p class="text-sm font-medium text-highlighted">
          Copy your new token now. It is only shown once.
        </p>
        <code class="block rounded-md bg-elevated p-3 text-sm break-all select-all">{{ revealedToken }}</code>
        <div class="flex flex-wrap gap-3">
          <UButton
            label="Copy token"
            icon="i-lucide-copy"
            @click="copyToken"
          />
          <UButton
            label="Done"
            color="neutral"
            variant="soft"
            @click="revealedToken = undefined"
          />
        </div>
      </div>

      <ul
        v-if="props.tokens.length"
        class="flex flex-col divide-y divide-default"
      >
        <li
          v-for="token in props.tokens"
          :key="token.id"
          class="flex flex-col items-start gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <div class="flex max-w-full min-w-0 flex-col sm:flex-1">
            <span class="font-medium [overflow-wrap:anywhere] text-highlighted">{{ token.name }}</span>
            <span class="flex flex-wrap gap-x-3 text-sm text-muted">
              <span class="tabular-nums">wd_{{ token.prefix }}…</span>
              <span :title="token.lastUsedAt ? timestampFormatter.format(new Date(token.lastUsedAt)) : undefined">{{ lastUsedLabel(token) }}</span>
            </span>
          </div>
          <UButton
            label="Revoke"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            class="-ms-2.5 sm:ms-0"
            @click="askToRevoke(token)"
          />
        </li>
      </ul>
      <p
        v-else
        class="text-sm text-muted"
      >
        No tokens yet. Name one after the script that will use it.
      </p>

      <UForm
        name="create-token"
        :state="{ name }"
        class="flex flex-col gap-3 sm:flex-row sm:items-end"
        @submit="createToken"
      >
        <UFormField
          name="name"
          label="Token name"
          :error="nameError"
          class="w-full sm:max-w-sm"
        >
          <UInput
            v-model="name"
            :maxlength="MAX_NAME_LENGTH"
            placeholder="backup-script"
            autocomplete="off"
            class="w-full"
            @update:model-value="nameError = undefined"
          />
        </UFormField>
        <UButton
          type="submit"
          label="Create token"
          icon="i-lucide-plus"
          :loading="isCreating"
          :disabled="!name.trim()"
          class="w-fit"
        />
      </UForm>
    </UPageCard>

    <UModal
      v-model:open="isRevokeOpen"
      title="Revoke this token?"
      :description="`Scripts using “${tokenPendingRevoke?.name}” stop working right away. This can't be undone.`"
      :ui="{ footer: 'justify-end' }"
    >
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="soft"
          @click="isRevokeOpen = false"
        />
        <UButton
          label="Revoke token"
          color="error"
          loading-auto
          @click="revokeToken"
        />
      </template>
    </UModal>
  </section>
</template>
