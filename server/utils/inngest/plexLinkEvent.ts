export const PLEX_LINK_EVENT = 'plex/link.requested'

export interface PlexLinkEventData {
  userId: number
  rerun: boolean
}
