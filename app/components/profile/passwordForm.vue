<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

const toast = useToast()
const toastApiError = useApiErrorToast()

const schema = z
  .object({
    currentPassword: z.string({ message: 'Current password is required' }).min(1, 'Current password is required'),
    newPassword: z.string({ message: 'New password is required' }).min(8, 'Must be at least 8 characters'),
    confirmPassword: z.string({ message: 'Confirm your password' }).min(8, 'Must be at least 8 characters')
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  })

type schema = z.input<typeof schema>

const state = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const loading = ref(false)

async function onSubmit(payload: FormSubmitEvent<schema>) {
  loading.value = true
  try {
    await $fetch('/api/auth/password', {
      method: 'PUT',
      body: {
        currentPassword: 'currentPassword' in payload.data ? payload.data.currentPassword : undefined,
        newPassword: payload.data.newPassword
      }
    })
    toast.add({
      title: 'Password changed',
      color: 'success'
    })
    state.currentPassword = ''
    state.newPassword = ''
    state.confirmPassword = ''
  } catch (error: unknown) {
    toastApiError(error, 'Failed', 'Could not update password')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UPageCard
    title="Change Password"
  >
    <UForm
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4 max-w-xs"
      @submit="onSubmit"
    >
      <UFormField
        label="Current Password"
        name="currentPassword"
        required
      >
        <UInput
          v-model="state.currentPassword"
          type="password"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="New Password"
        name="newPassword"
        required
      >
        <UInput
          v-model="state.newPassword"
          type="password"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Confirm Password"
        name="confirmPassword"
        required
      >
        <UInput
          v-model="state.confirmPassword"
          type="password"
          class="w-full"
        />
      </UFormField>

      <UButton
        type="submit"
        label="Change password"
        :loading="loading"
        class="w-fit"
      />
    </UForm>
  </UPageCard>
</template>
