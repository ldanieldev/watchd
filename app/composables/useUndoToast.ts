import type { WatchEvent } from '~~/shared/utils/library/types'

export function useUndoToast() {
  const toast = useToast()
  const { discardWatches } = useLibrary()

  function showUndoToast(title: string, undo: () => void, options: { description?: string, icon?: string } = {}) {
    toast.add({
      title,
      description: options.description,
      icon: options.icon ?? 'i-lucide-undo-2',
      actions: [{ label: 'Undo', color: 'neutral', variant: 'outline', onClick: undo }]
    })
  }

  function announceMarked(title: string, added: WatchEvent[]) {
    if (added.length === 0) return
    showUndoToast(title, () => discardWatches(added), {
      description: added.length === 1 ? '1 episode' : `${added.length} episodes`,
      icon: 'i-lucide-check-check'
    })
  }

  return { showUndoToast, announceMarked }
}
