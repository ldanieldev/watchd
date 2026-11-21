<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

const { user, fetch: fetchSession } = useUserSession()
const toast = useToast()
const toastApiError = useApiErrorToast()

const schema = z.object({
  name: z.string({ message: 'Name is required' }).min(1, 'Name is required'),
  email: z.email({ message: 'Email is required' })
})

type Schema = z.input<typeof schema>

const state = reactive<Partial<Schema>>({
  name: user.value?.name ?? '',
  email: user.value?.email ?? ''
})

const loading = ref(false)

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    await $fetch(`/api/users/${user.value!.id}`, {
      method: 'PUT',
      body: payload.data
    })
    await fetchSession()
    toast.add({
      title: 'Profile updated',
      color: 'success'
    })
  } catch (error: unknown) {
    toastApiError(error, 'Update failed', 'Could not update profile')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UPageCard
    title="Profile Information"
  >
    <!-- A field named "name" shadows form.name, so without this the unset name hydrates to the string "undefined". -->
    <UForm
      name="profile-information"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4 max-w-xs"
      @submit="onSubmit"
    >
      <UFormField
        label="Name"
        name="name"
        required
      >
        <UInput
          v-model="state.name"
          placeholder="Enter your name"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Email"
        name="email"
        required
      >
        <UInput
          v-model="state.email"
          type="email"
          placeholder="Enter your email"
          class="w-full"
        />
      </UFormField>

      <UButton
        type="submit"
        label="Save changes"
        :loading="loading"
        class="w-fit"
      />
    </UForm>
  </UPageCard>
</template>
