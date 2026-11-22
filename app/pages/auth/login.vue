<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

const { fetch: fetchSession } = useUserSession()
const toast = useToast()

const { data: registration } = await useFetch('/api/auth/registration')
const registrationOpen = computed(() => registration.value?.open !== false)

const fields: AuthFormField[] = [
  {
    name: 'email',
    type: 'email',
    autocomplete: 'username',
    label: 'Email',
    placeholder: 'Enter your email',
    required: true
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    autocomplete: 'current-password',
    placeholder: 'Enter your password',
    required: true
  }
]

const schema = z.object({
  email: z.email({ message: 'Email is required' }),
  password: z.string({ message: 'Password is required' }).min(8, 'Must be at least 8 characters')
})

type Schema = z.output<typeof schema>

const loading = ref(false)

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: payload.data
    })
    await fetchSession()
    await navigateTo('/')
  } catch (error: unknown) {
    const message
      = error instanceof Error && 'data' in error
        ? (error as { data?: { statusMessage?: string } }).data?.statusMessage
        : undefined
    toast.add({
      title: 'Login failed',
      description: message || 'Invalid email or password',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-md p-4">
    <UPageCard class="w-full max-w-md">
      <UAuthForm
        :schema="schema"
        title="Login"
        description="Enter your credentials to access your account."
        icon="i-lucide-user"
        :fields="fields"
        :submit="{ label: 'Sign in' }"
        :loading="loading"
        @submit="onSubmit"
      >
        <template
          v-if="registrationOpen"
          #footer
        >
          Don't have an account?
          <ULink
            to="/auth/register"
            class="text-primary font-medium"
          > Register </ULink>
        </template>
      </UAuthForm>
    </UPageCard>
  </div>
</template>
