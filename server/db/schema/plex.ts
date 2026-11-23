import { boolean, integer, jsonb, text, timestamp, unique, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { appSchema, commonColumns } from '../shared'
import { titles } from './library'
import { users } from './users'

export interface PlexReport {
  pulled: { added: number, duplicates: number, unresolved: number }
  pushed: number
  unmatched: { noTmdbGuid: number, episodeNotInTmdb: number }
  errors: number
  finishedAt: string
}

export type PlexItemKind = 'movie' | 'show' | 'episode'
export type PlexUnmatchedReason = 'no-tmdb-guid' | 'episode-not-in-tmdb'

export const plexConnections = appSchema.table(
  'plex_connections',
  {
    ...commonColumns,
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    accountToken: text('account_token').notNull(),
    serverToken: text('server_token').notNull(),
    serverMachineId: varchar('server_machine_id', { length: 64 }).notNull(),
    serverName: varchar('server_name', { length: 255 }).notNull(),
    serverUrl: text('server_url').notNull(),
    serverUrlOverride: text('server_url_override'),
    profileAccountId: integer('profile_account_id').notNull(),
    profileName: varchar('profile_name', { length: 255 }).notNull(),
    sectionIds: jsonb('section_ids').$type<string[]>().notNull().default([]),
    historyCursor: integer('history_cursor'),
    lastScanAt: timestamp('last_scan_at', { withTimezone: true }),
    lastPlayAt: timestamp('last_play_at', { withTimezone: true }),
    lastReport: jsonb('last_report').$type<PlexReport>(),
    isServerOwner: boolean('is_server_owner').notNull().default(true),
    tokenInvalid: boolean('token_invalid').notNull().default(false)
  },
  table => [
    unique('plex_connections_user_unique').on(table.userId),
    uniqueIndex('plex_connections_server_profile_unique').on(table.serverMachineId, table.profileAccountId)
  ]
)

export const plexItems = appSchema.table(
  'plex_items',
  {
    ...commonColumns,
    connectionId: integer('connection_id').notNull().references(() => plexConnections.id, { onDelete: 'cascade' }),
    ratingKey: varchar('rating_key', { length: 32 }).notNull(),
    kind: varchar({ length: 8 }).$type<PlexItemKind>().notNull(),
    sectionId: varchar('section_id', { length: 32 }).notNull(),
    parentRatingKey: varchar('parent_rating_key', { length: 32 }),
    name: varchar({ length: 500 }),
    titleId: integer('title_id').references(() => titles.id, { onDelete: 'cascade' }),
    season: integer(),
    number: integer(),
    unmatchedReason: varchar('unmatched_reason', { length: 24 }).$type<PlexUnmatchedReason>(),
    viewCount: integer('view_count').notNull().default(0),
    lastViewedAt: integer('last_viewed_at'),
    expectedViewCount: integer('expected_view_count'),
    outboundPending: boolean('outbound_pending').notNull().default(false)
  },
  table => [unique('plex_items_connection_rating_key_unique').on(table.connectionId, table.ratingKey)]
)

export const plexUnresolvedHistory = appSchema.table(
  'plex_unresolved_history',
  {
    ...commonColumns,
    connectionId: integer('connection_id').notNull().references(() => plexConnections.id, { onDelete: 'cascade' }),
    historyId: integer('history_id').notNull(),
    ratingKey: varchar('rating_key', { length: 32 }).notNull(),
    viewedAt: integer('viewed_at').notNull(),
    sectionId: varchar('section_id', { length: 32 })
  },
  table => [unique('plex_unresolved_history_connection_history_unique').on(table.connectionId, table.historyId)]
)

export const plexUnmarked = appSchema.table(
  'plex_unmarked',
  {
    ...commonColumns,
    connectionId: integer('connection_id').notNull().references(() => plexConnections.id, { onDelete: 'cascade' }),
    ratingKey: varchar('rating_key', { length: 32 }).notNull(),
    titleId: integer('title_id').notNull().references(() => titles.id, { onDelete: 'cascade' }),
    season: integer(),
    number: integer(),
    unmarkedAt: timestamp('unmarked_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [unique('plex_unmarked_connection_rating_key_unique').on(table.connectionId, table.ratingKey)]
)
