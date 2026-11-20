<script setup lang="ts">
import type { CreditPerson } from '~/utils/library/details'
import { personDetailFor } from '~/utils/library/details'
import { personPath } from '~/utils/library/paths'
import { tmdbImage } from '~/utils/library/tmdb'

defineProps<{
  heading: string
  people: CreditPerson[]
}>()

const NuxtLinkComponent = resolveComponent('NuxtLink')
const failedProfilePersonIds = ref(new Set<number>())

function initialsOf(name: string) {
  return name.split(/\s+/).map(part => part[0]).slice(0, 2).join('')
}

function hasProfileImage(person: CreditPerson) {
  return person.profilePath !== undefined && !failedProfilePersonIds.value.has(person.personId)
}
</script>

<template>
  <section
    v-if="people.length"
    class="flex flex-col gap-3"
  >
    <h2 class="font-display text-xl font-bold text-highlighted">
      {{ heading }}
    </h2>
    <ul
      class="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-1 pb-2 focus-visible:outline-2 focus-visible:outline-primary"
      tabindex="0"
      :aria-label="heading"
    >
      <li
        v-for="person in people"
        :key="`${person.personId}-${person.role}`"
        class="w-28 shrink-0 snap-start sm:w-32"
      >
        <component
          :is="personDetailFor(person.personId) ? NuxtLinkComponent : 'div'"
          :to="personDetailFor(person.personId) ? personPath(person.personId) : undefined"
          class="group block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <div class="relative aspect-[2/3] overflow-hidden rounded-md bg-elevated ring-1 ring-default/50">
            <img
              v-if="hasProfileImage(person)"
              :src="tmdbImage(person.profilePath!, 'w185')"
              :srcset="`${tmdbImage(person.profilePath!, 'w185')} 185w, ${tmdbImage(person.profilePath!, 'h632')} 421w`"
              sizes="8rem"
              :alt="person.name"
              loading="lazy"
              decoding="async"
              class="absolute inset-0 size-full object-cover"
              @error="failedProfilePersonIds.add(person.personId)"
            >
            <span
              v-else
              class="absolute inset-0 flex items-center justify-center font-display text-2xl font-bold text-muted"
              aria-hidden="true"
            >
              {{ initialsOf(person.name) }}
            </span>
          </div>
          <p
            class="mt-2 line-clamp-1 text-sm font-medium text-highlighted"
            :class="{ 'group-hover:text-primary': personDetailFor(person.personId) }"
          >
            {{ person.name }}
          </p>
          <p class="mt-0.5 line-clamp-2 text-xs text-muted">
            {{ person.role }}
          </p>
        </component>
      </li>
    </ul>
  </section>
</template>
