<script setup lang="ts">
import type { CreditPerson } from '~~/shared/types/library'
import { personPath } from '~/utils/library/paths'
import { tmdbImage } from '~/utils/library/tmdb'

withDefaults(defineProps<{
  heading: string
  people: CreditPerson[]
  headingTag?: 'h2' | 'h3'
}>(), { headingTag: 'h2' })

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
    <component
      :is="headingTag"
      class="font-display font-bold text-highlighted"
      :class="headingTag === 'h2' ? 'text-xl' : 'text-base'"
    >
      {{ heading }}
    </component>
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
        <NuxtLink
          :to="personPath(person.personId)"
          :title="person.role ? `${person.name} · ${person.role}` : person.name"
          class="group block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <div class="relative aspect-[2/3] overflow-hidden rounded-md bg-elevated ring-1 ring-default/50">
            <img
              width="185"
              height="278"
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
          <p class="mt-2 line-clamp-2 text-sm font-medium text-highlighted group-hover:text-primary">
            {{ person.name }}
          </p>
          <p class="mt-0.5 line-clamp-2 text-xs text-muted">
            {{ person.role }}
          </p>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
