import type { Title } from '~~/shared/utils/library/types'

export function useTitleRefresh() {
  const toast = useToast()
  const showApiError = useApiErrorToast()
  const isRefreshing = ref(false)

  async function refreshTitle(title: Pick<Title, 'id' | 'name'>) {
    isRefreshing.value = true
    try {
      await $fetch(`/api/library/titles/${title.id}/refresh`, { method: 'POST' })
      toast.add({ title: `Refreshing ${title.name}`, description: 'Reload the page in a minute to see the changes.', color: 'success' })
    } catch (error) {
      showApiError(error, `Couldn't refresh ${title.name}`, 'Try again in a moment.')
    } finally {
      isRefreshing.value = false
    }
  }

  return { isRefreshing, refreshTitle }
}
