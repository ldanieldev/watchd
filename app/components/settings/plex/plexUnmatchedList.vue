<script setup lang="ts">
import type { PlexUnmatched } from '~/types/plex'

const reasonLabels = { 'no-tmdb-guid': 'No TMDB match', 'episode-not-in-tmdb': 'Episode missing on TMDB' } as const

const unmatched = ref<PlexUnmatched>()
const loadFailed = ref(false)

async function refresh() {
  try {
    unmatched.value = await $fetch<PlexUnmatched>('/api/plex/unmatched')
    loadFailed.value = false
  } catch {
    loadFailed.value = true
  }
}

onMounted(refresh)

defineExpose({ refresh })
</script>

<template>
  <section
    v-if="unmatched || loadFailed"
    aria-labelledby="plex-unmatched-title"
  >
    <UPageCard>
      <div class="flex flex-col gap-1">
        <h2
          id="plex-unmatched-title"
          class="font-display text-lg font-bold text-highlighted"
        >
          Not matched
          <span
            v-if="unmatched?.items.length"
            class="font-sans text-base font-normal text-muted tabular-nums"
          >{{ unmatched.items.length.toLocaleString('en') }}</span>
        </h2>
        <p class="max-w-prose text-sm text-muted">
          Plex has no TMDB match for these, so their plays can't reach watchd. Use Fix Match in Plex, then Scan now.
        </p>
      </div>

      <p
        v-if="loadFailed"
        role="alert"
        class="text-sm text-error"
      >
        Couldn't load the unmatched Plex items. Reload the page to try again.
      </p>
      <p
        v-if="unmatched && !unmatched.items.length"
        class="text-sm text-muted"
      >
        Everything in your checked libraries is matched.
      </p>
      <div
        v-else-if="unmatched"
        class="plex-unmatched-scroller -mx-2 max-h-[28rem] overflow-y-auto px-2"
        tabindex="0"
        role="region"
        aria-labelledby="plex-unmatched-title"
      >
        <ul class="flex flex-col divide-y divide-default">
          <li
            v-for="(item, index) in unmatched.items"
            :key="`${index}-${item.name}`"
            class="flex flex-col py-2.5 first:pt-0 last:pb-0"
          >
            <span class="break-words text-highlighted">{{ item.name }}</span>
            <span class="text-sm text-muted">{{ item.library }}<template v-if="item.reason">, {{ reasonLabels[item.reason] }}</template></span>
          </li>
        </ul>
      </div>

      <p
        v-if="unmatched && unmatched.unresolvedHistory > 0"
        class="text-sm text-muted tabular-nums"
      >
        {{ unmatched.unresolvedHistory === 1 ? '1 play' : `${unmatched.unresolvedHistory.toLocaleString('en')} plays` }} from Plex history will be added once their items match.
      </p>
    </UPageCard>
  </section>
</template>

<style scoped>
.plex-unmatched-scroller {
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}

.plex-unmatched-scroller:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
  border-radius: var(--ui-radius);
}
</style>
