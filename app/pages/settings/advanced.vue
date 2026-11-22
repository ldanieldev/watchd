<script setup lang="ts">
import type { AccessTokenSummary } from '~~/shared/types/accessTokens'

useHead({ title: 'Advanced' })

const { data: tokens, refresh } = await useFetch<AccessTokenSummary[]>('/api/tokens', { default: () => [] })
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="sr-only">
      Advanced
    </h1>
    <SettingsMaintenanceMetadataCard />
    <SettingsMaintenanceSearchCard />
    <SettingsMaintenanceCacheCard />
    <SettingsAccessTokens
      :tokens="tokens"
      @changed="refresh"
    />
  </div>
</template>
