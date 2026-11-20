import type { MediaType } from './types'

interface MediaTypeStyle {
  label: string
  tagClass: string
  barClass: string
  fallbackClass: string
}

export const mediaTypeStyles: Record<MediaType, MediaTypeStyle> = {
  tv: {
    label: 'TV',
    tagClass: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
    barClass: 'bg-cyan-500',
    fallbackClass: 'from-cyan-700 to-slate-900'
  },
  anime: {
    label: 'Anime',
    tagClass: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
    barClass: 'bg-pink-500',
    fallbackClass: 'from-pink-700 to-slate-900'
  },
  movie: {
    label: 'Movie',
    tagClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    barClass: 'bg-amber-500',
    fallbackClass: 'from-amber-700 to-slate-900'
  }
}
