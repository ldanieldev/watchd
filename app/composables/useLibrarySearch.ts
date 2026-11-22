import type { Ref } from 'vue'
import type { SearchCategory, SearchHit } from '~~/shared/types/search'

export type LibrarySearchStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

const SEARCH_DEBOUNCE_MS = 150
const MAX_VISIBLE_HITS = 8

export function useLibrarySearch(query: Ref<string>, category: Ref<SearchCategory>) {
  const hits = ref<SearchHit[]>([])
  const status = ref<LibrarySearchStatus>('idle')
  let latestRequestSequence = 0
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  async function runSearch(trimmedQuery: string, searchCategory: SearchCategory, requestSequence: number) {
    try {
      const results = await $fetch<SearchHit[]>('/api/search', { query: { q: trimmedQuery, category: searchCategory }, retry: 0 })
      if (requestSequence !== latestRequestSequence) return
      hits.value = results.slice(0, MAX_VISIBLE_HITS)
      status.value = 'ready'
    } catch {
      if (requestSequence !== latestRequestSequence) return
      hits.value = []
      status.value = 'unavailable'
    }
  }

  watch([query, category], ([nextQuery, nextCategory]) => {
    clearTimeout(debounceTimer)
    const requestSequence = ++latestRequestSequence
    const trimmedQuery = nextQuery.trim()
    if (!trimmedQuery) {
      hits.value = []
      status.value = 'idle'
      return
    }
    status.value = 'loading'
    debounceTimer = setTimeout(() => runSearch(trimmedQuery, nextCategory, requestSequence), SEARCH_DEBOUNCE_MS)
  })

  onScopeDispose(() => clearTimeout(debounceTimer))

  return { hits, status }
}
