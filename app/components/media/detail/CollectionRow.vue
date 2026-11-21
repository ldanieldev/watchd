<script setup lang="ts">
import type { CollectionMemberState } from '~~/shared/utils/library/detail'
import type { Title } from '~~/shared/utils/library/types'
import { parseIsoDate } from '~~/shared/utils/library/dates'
import { titlePath } from '~/utils/library/paths'

const props = defineProps<{
  name: string
  members: { title: Title, state: CollectionMemberState }[]
}>()

const unseenCount = computed(() => props.members.filter(member => member.state === 'unwatched').length)
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
</script>

<template>
  <section
    v-if="members.length > 1"
    class="flex flex-col gap-3"
    aria-labelledby="collection-title"
  >
    <h2
      id="collection-title"
      class="font-display text-xl font-bold text-highlighted"
    >
      {{ name }}
    </h2>
    <p
      v-if="unseenCount > 0"
      class="flex w-fit items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
    >
      <UIcon
        name="i-lucide-circle-alert"
        class="size-4"
      />
      {{ unseenCount }} {{ unseenCount === 1 ? 'film' : 'films' }} in this collection you haven't seen
    </p>
    <ul class="flex gap-4 overflow-x-auto pb-2">
      <li
        v-for="member in members"
        :key="member.title.id"
        class="w-28 shrink-0 sm:w-32"
      >
        <NuxtLink
          :to="titlePath(member.title)"
          class="group flex flex-col gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <div
            class="relative"
            :class="member.state === 'unreleased' && 'opacity-60'"
          >
            <MediaPosterImage
              :title="member.title"
              sizes="8rem"
            />
            <span
              v-if="member.state === 'watched'"
              class="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-inverted"
            >
              <UIcon
                name="i-lucide-check"
                class="size-3.5"
              />
              <span class="sr-only">Watched</span>
            </span>
          </div>
          <span class="flex flex-col text-xs">
            <span class="font-medium text-highlighted group-hover:text-primary">{{ member.title.name }}</span>
            <span
              v-if="member.state === 'unreleased'"
              class="text-muted"
            >
              Not released · {{ dateFormatter.format(parseIsoDate(member.title.firstAired)) }}
            </span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
