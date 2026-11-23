import { and, eq } from 'drizzle-orm'
import { plexConnections } from '../../db/schema'
import { PlexServer } from './client'

export type PlexConnectionRow = typeof plexConnections.$inferSelect

export async function loadPlexConnection(userId: number): Promise<PlexConnectionRow | null> {
  const [connection] = await withQuerySpan('select-plex-connection', () => db
    .select()
    .from(plexConnections)
    .where(eq(plexConnections.userId, userId))
    .limit(1))
  return connection ?? null
}

export async function loadServerOwnerConnection(serverMachineId: string): Promise<PlexConnectionRow | null> {
  const [connection] = await withQuerySpan('select-plex-server-owner-connection', () => db
    .select()
    .from(plexConnections)
    .where(and(eq(plexConnections.serverMachineId, serverMachineId), eq(plexConnections.isServerOwner, true), eq(plexConnections.tokenInvalid, false)))
    .limit(1))
  return connection ?? null
}

export function plexServerFor(connection: Pick<PlexConnectionRow, 'serverUrl' | 'serverUrlOverride' | 'serverToken'>): PlexServer {
  return new PlexServer({ url: connection.serverUrlOverride ?? connection.serverUrl, token: connection.serverToken })
}
