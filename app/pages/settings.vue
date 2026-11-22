<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const links = [[
  {
    label: 'Profile',
    icon: 'i-lucide-user',
    to: '/settings/profile'
  },
  {
    label: 'Integrations',
    icon: 'i-lucide-blocks',
    to: '/settings/integrations'
  },
  {
    label: 'Import Data',
    icon: 'i-lucide-file-up',
    to: '/settings/import'
  },
  {
    label: 'Export Data',
    icon: 'i-lucide-file-down',
    to: '/settings/export'
  },
  {
    label: 'Advanced',
    icon: 'i-lucide-wrench',
    to: '/settings/advanced'
  }
]
] satisfies NavigationMenuItem[][]
</script>

<template>
  <div class="w-full">
    <UNavigationMenu
      :items="links"
      highlight
      class="px-4 flex-1"
      :ui="{ root: 'overflow-x-auto [&>div]:min-w-max', list: 'min-w-max', item: 'shrink-0' }"
    />
    <USeparator />
    <main class="page-shell">
      <NuxtPage />
    </main>
  </div>
</template>
