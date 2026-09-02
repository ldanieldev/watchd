<script setup lang="ts">
const { user, clear } = useUserSession()
const toast = useToast()
const toastApiError = useApiErrorToast()
const showModal = ref(false)

async function deleteAccount() {
  if (!user.value) return

  try {
    await $fetch(`/api/users/${user.value.id}`, {
      method: 'DELETE'
    })
  } catch (error: unknown) {
    toastApiError(error, 'Account deletion failed', 'Could not delete account')
    return
  }

  toast.add({
    title: 'Account deleted',
    color: 'success'
  })

  await clear()
}
</script>

<template>
  <UPageCard
    title="Account"
    description="No longer want to use our service? You can delete your account here. This action is not reversible. All information related to this account will be deleted permanently."
    class="bg-linear-to-tl from-error/10 from-5% to-default"
    variant="soft"
  >
    <template #footer>
      <UButton
        label="Delete account"
        color="error"
        @click="showModal = true"
      />
    </template>
  </UPageCard>

  <UModal
    v-model:open="showModal"
    :dismissible="false"
    :close="false"
    title="Delete account"
    description="Are you sure you want to delete your account? This action is not reversible. All information related to this account will be deleted permanently."
    :ui="{ footer: 'justify-end' }"
  >
    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="soft"
        @click="showModal = false"
      />
      <UButton
        label="Delete"
        color="error"
        loading-auto
        @click="deleteAccount"
      />
    </template>
  </UModal>
</template>
