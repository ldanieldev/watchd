import type { TitleStatus } from './types'

export const statusStyles: Record<TitleStatus, { label: string, colorClass: string }> = {
  completed: { label: 'Completed', colorClass: 'bg-primary' },
  watching: { label: 'Watching', colorClass: 'bg-primary/55' },
  paused: { label: 'Paused', colorClass: 'bg-accented' },
  planned: { label: 'Planned', colorClass: 'bg-neutral-400 dark:bg-neutral-500' },
  dropped: { label: 'Dropped', colorClass: 'bg-neutral-600 dark:bg-neutral-700' }
}
