import { boolean, index, integer, jsonb, smallint, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core'
import type { CreditPerson, TitleExtra } from '../../../shared/types/library'
import { appSchema, commonColumns } from '../shared'
import { users } from './users'

export type TitleKind = 'movie' | 'tv'
export type EnrichmentState = 'pending' | 'ready' | 'failed'
export type WatchSource = 'floppy' | 'trakt' | 'watchd' | 'plex'

export const titles = appSchema.table(
  'titles',
  {
    ...commonColumns,
    kind: varchar({ length: 8 }).$type<TitleKind>().notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    name: varchar({ length: 500 }).notNull(),
    originalName: varchar('original_name', { length: 500 }),
    alternativeNames: jsonb('alternative_names').$type<string[]>(),
    firstAired: varchar('first_aired', { length: 10 }),
    posterPath: varchar('poster_path', { length: 255 }),
    backdropPath: varchar('backdrop_path', { length: 255 }),
    runtimeMinutes: smallint('runtime_minutes'),
    isAnime: boolean('is_anime').notNull().default(false),
    genres: jsonb().$type<string[]>().notNull().default([]),
    studios: jsonb().$type<string[]>().notNull().default([]),
    network: varchar({ length: 255 }),
    cast: jsonb().$type<CreditPerson[]>().notNull().default([]),
    crew: jsonb().$type<CreditPerson[]>().notNull().default([]),
    detail: jsonb().$type<TitleExtra>(),
    tmdbStatus: varchar('tmdb_status', { length: 64 }),
    enrichmentState: varchar('enrichment_state', { length: 16 }).$type<EnrichmentState>().notNull().default('pending'),
    enrichedAt: timestamp('enriched_at'),
    enrichmentError: text('enrichment_error')
  },
  table => [unique('titles_kind_tmdb_unique').on(table.kind, table.tmdbId)]
)

export const episodes = appSchema.table(
  'episodes',
  {
    ...commonColumns,
    titleId: integer('title_id').notNull().references(() => titles.id, { onDelete: 'cascade' }),
    season: smallint().notNull(),
    number: smallint().notNull(),
    airDate: varchar('air_date', { length: 10 }),
    name: varchar({ length: 500 }),
    overview: text(),
    stillPath: varchar('still_path', { length: 255 }),
    runtimeMinutes: smallint('runtime_minutes'),
    tmdbEpisodeId: integer('tmdb_episode_id')
  },
  table => [
    unique('episodes_title_season_number_unique').on(table.titleId, table.season, table.number),
    index('episodes_tmdb_episode_id_idx').on(table.tmdbEpisodeId)
  ]
)

export const watches = appSchema.table(
  'watches',
  {
    ...commonColumns,
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    titleId: integer('title_id').notNull().references(() => titles.id, { onDelete: 'cascade' }),
    season: smallint(),
    number: smallint(),
    watchedAt: timestamp('watched_at', { withTimezone: true }).notNull(),
    // UTC minute of watchedAt, kept as a column because date_trunc on timestamptz isn't immutable and can't be indexed.
    watchedMinute: timestamp('watched_minute').notNull(),
    minutesWatched: smallint('minutes_watched'),
    source: varchar({ length: 16 }).$type<WatchSource>().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    plexHistoryId: integer('plex_history_id'),
    plexServerMachineId: varchar('plex_server_machine_id', { length: 64 })
  },
  table => [
    unique('watches_dedup').on(table.userId, table.titleId, table.season, table.number, table.watchedMinute).nullsNotDistinct(),
    index('watches_user_plex_history_idx').on(table.userId, table.plexHistoryId)
  ]
)

export const userTitles = appSchema.table(
  'user_titles',
  {
    ...commonColumns,
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    titleId: integer('title_id').notNull().references(() => titles.id, { onDelete: 'cascade' }),
    typeOverride: varchar('type_override', { length: 8 }).$type<'tv' | 'anime'>(),
    heldStatus: varchar('held_status', { length: 8 }).$type<'paused' | 'dropped'>()
  },
  table => [unique('user_titles_user_title_unique').on(table.userId, table.titleId)]
)
