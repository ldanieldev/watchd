<script setup lang="ts">
import type { PersonDetail as PersonDetailData } from '~/utils/library/details'
import type { ShelfItem } from '~/components/media/PosterShelf.vue'
import { watchedTitlesForPerson } from '~/utils/library/detail'
import { parseIsoDate } from '~/utils/library/dates'
import { tmdbImage } from '~/utils/library/tmdb'

const props = defineProps<{ person: PersonDetailData }>()

const { data } = useLibrary()
const biographyExpanded = ref(false)
const biographyClamped = ref(false)
const biographyElement = useTemplateRef<HTMLElement>('biography')
let biographyResizeObserver: ResizeObserver | undefined

function measureBiography() {
  const element = biographyElement.value
  if (element && !biographyExpanded.value) biographyClamped.value = element.scrollHeight > element.clientHeight
}

onMounted(() => {
  measureBiography()
  if (!biographyElement.value) return
  biographyResizeObserver = new ResizeObserver(measureBiography)
  biographyResizeObserver.observe(biographyElement.value)
})
onBeforeUnmount(() => biographyResizeObserver?.disconnect())
const profileFailed = ref(false)
const birthdayFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

const initials = computed(() => props.person.name.split(/\s+/).map(part => part[0]).slice(0, 2).join(''))

const bornLine = computed(() => {
  const birthday = props.person.birthday ? birthdayFormatter.format(parseIsoDate(props.person.birthday)) : undefined
  return [birthday, props.person.placeOfBirth].filter(Boolean).join(' · ')
})

const watchedShelfItems = computed<ShelfItem[]>(() =>
  watchedTitlesForPerson(data.value, props.person).map((title) => {
    const mediaType = title.type === 'movie' ? 'movie' : 'tv'
    const credit = props.person.credits.find(candidate => candidate.tmdbId === title.tmdbId && candidate.mediaType === mediaType)
    return { key: title.id, title, caption: credit?.role ?? '' }
  }))

const watchedHeading = computed(() => `You've watched ${watchedShelfItems.value.length} of their titles`)
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col gap-10 overflow-y-auto p-4 sm:p-6 lg:p-8">
    <section
      class="flex flex-col gap-5 rounded-xl bg-elevated p-5 sm:flex-row sm:gap-8 sm:p-8"
      aria-labelledby="person-name"
    >
      <div class="relative aspect-[2/3] w-28 shrink-0 self-start overflow-hidden rounded-md bg-default shadow-lg ring-1 ring-default/50 sm:w-40 lg:w-48">
        <img
          v-if="person.profilePath && !profileFailed"
          :src="tmdbImage(person.profilePath, 'w300')"
          :srcset="`${tmdbImage(person.profilePath, 'w300')} 300w, ${tmdbImage(person.profilePath, 'h632')} 421w`"
          sizes="(min-width: 1024px) 12rem, (min-width: 640px) 10rem, 7rem"
          :alt="person.name"
          fetchpriority="high"
          class="absolute inset-0 size-full object-cover"
          @error="profileFailed = true"
        >
        <span
          v-else
          class="absolute inset-0 flex items-center justify-center font-display text-4xl font-bold text-muted"
          aria-hidden="true"
        >{{ initials }}</span>
      </div>
      <div class="flex min-w-0 max-w-3xl flex-col gap-3">
        <h1
          id="person-name"
          class="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-highlighted text-balance sm:text-5xl lg:text-6xl"
        >
          {{ person.name }}
        </h1>
        <div class="flex flex-col gap-1 text-sm text-toned">
          <p>Known for {{ person.knownFor }}</p>
          <p v-if="bornLine">
            Born {{ bornLine }}
          </p>
        </div>
        <div
          v-if="person.biography"
          class="flex flex-col items-start gap-1"
        >
          <p
            ref="biography"
            class="whitespace-pre-line text-pretty text-default"
            :class="{ 'line-clamp-5': !biographyExpanded }"
          >
            {{ person.biography }}
          </p>
          <UButton
            v-if="biographyClamped || biographyExpanded"
            :label="biographyExpanded ? 'Show less' : 'Show more'"
            :aria-expanded="biographyExpanded"
            :trailing-icon="biographyExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            color="primary"
            variant="link"
            size="sm"
            class="px-0 font-semibold"
            @click="biographyExpanded = !biographyExpanded"
          />
        </div>
      </div>
    </section>

    <MediaPosterShelf
      :heading="watchedHeading"
      :items="watchedShelfItems"
      :show-see-all="false"
    />

    <MediaDetailFilmography :credits="person.credits" />
  </main>
</template>
