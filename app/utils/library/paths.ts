import type { Title } from './types'

const sectionByType: Record<Title['type'], string> = { tv: 'tv', anime: 'anime', movie: 'movies' }

export function titlePath(title: Pick<Title, 'id' | 'type'>): string {
  return `/${sectionByType[title.type]}/${title.id}`
}

export function seasonPath(title: Pick<Title, 'id' | 'type'>, season: number): string {
  return `${titlePath(title)}/season/${season}`
}

export function personPath(personId: number): string {
  return `/people/${personId}`
}
