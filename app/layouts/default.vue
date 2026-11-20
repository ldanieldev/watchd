<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { loggedIn } = useUserSession()

watch(loggedIn, () => {
  if (!loggedIn.value) {
    navigateTo('/auth/login')
  }
})

const isSidebarOpen = useCookie<boolean>('sidebar-open', { default: () => true })

const navMenuItems = [
  [
    {
      label: 'Home',
      icon: 'i-lucide-home',
      to: '/'
    },
    {
      label: 'Movies',
      icon: 'i-lucide-film',
      to: '/movies'
    },
    {
      label: 'TV Shows',
      icon: 'i-lucide-tv',
      to: '/tv'
    },
    {
      label: 'Anime',
      icon: 'i-lucide-sparkles',
      to: '/anime'
    }
  ],
  [
    {
      label: 'Calendar',
      icon: 'i-lucide-calendar',
      to: '/calendar'
    },
    {
      label: 'History',
      icon: 'i-lucide-clock'
    },
    {
      label: 'Statistics',
      icon: 'i-lucide-bar-chart'
    }
  ]
] satisfies NavigationMenuItem[][]
</script>

<template>
  <div class="flex flex-col min-h-svh">
    <UHeader
      toggle-side="left"
      to="/"
      :ui="{ container: 'px-4! max-w-full', center: 'flex' }"
    >
      <template #toggle>
        <UButton
          icon="i-lucide-menu"
          color="neutral"
          variant="ghost"
          aria-label="Toggle sidebar"
          @click="isSidebarOpen = !isSidebarOpen"
        />
      </template>

      <template #title>
        <div class="flex items-center gap-2">
          <AppLogo class="h-12 w-auto text-primary" />
          <span class="text-2xl font-bold hidden md:inline-block">
            <span class="text-primary">Watch</span>d
          </span>
        </div>
      </template>

      <template #default>
        <SearchBar />
      </template>
    </UHeader>

    <div class="flex flex-1 min-h-0">
      <USidebar
        v-model:open="isSidebarOpen"
        collapsible="icon"
        rail
        class="bg-elevated/25 [--sidebar-width:15rem]"
        :ui="{
          container: 'top-(--ui-header-height) h-[calc(100svh-var(--ui-header-height))]',
          footer: 'border-t border-default'
        }"
      >
        <template #default="{ state }">
          <UNavigationMenu
            :collapsed="state === 'collapsed'"
            :items="navMenuItems[0]"
            orientation="vertical"
            tooltip
            popover
          />

          <USeparator />

          <UNavigationMenu
            :collapsed="state === 'collapsed'"
            :items="navMenuItems[1]"
            orientation="vertical"
            tooltip
            popover
          />
        </template>

        <template #footer="{ state }">
          <UserMenu :collapsed="state === 'collapsed'" />
        </template>
      </USidebar>

      <slot />
    </div>
  </div>
</template>
