import type { ComputedRef } from 'vue'

export function useLibraryView<T>(path: string, params: () => Record<string, string> = () => ({})) {
  const timeZone = useLibraryTimeZone()
  const todayIso = useLibraryToday()
  const query: ComputedRef<Record<string, string>> = computed(() => ({ tz: timeZone.value, today: todayIso.value, ...params() }))
  return useFetch<T>(path, { query, key: computed(() => `${path}?${new URLSearchParams(query.value)}`) })
}
