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
    icon: 'i-lucide-blocks'
  },
  {
    label: 'Import Data',
    icon: 'i-lucide-file-up'
  },
  {
    label: 'Export Data',
    icon: 'i-lucide-file-down'
  },
  {
    label: 'Advanced',
    icon: 'i-lucide-wrench'
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
    />
    <USeparator />
    <main class="page-shell">
      <NuxtPage />
    </main>
  </div>
</template>
