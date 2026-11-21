import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'

const dialect = new PgDialect()
const renderedWheres: string[] = []
const mockDb = drizzle.mock()

function inertQuery<T extends object>(query: T): T {
  const target = query as unknown as { where: (condition: SQL) => unknown, then: unknown }
  const where = target.where.bind(query)
  target.where = (condition: SQL) => {
    renderedWheres.push(dialect.sqlToQuery(condition).sql)
    return where(condition)
  }
  target.then = (resolve: (value: unknown) => unknown) => Promise.resolve([]).then(resolve)
  return query
}

function inertSelect(builder: { from: (table: never) => object }) {
  return { from: (table: never) => inertQuery(builder.from(table)) }
}

const fakeDb = {
  select: (fields: never) => inertSelect(mockDb.select(fields) as never),
  selectDistinct: (fields: never) => inertSelect(mockDb.selectDistinct(fields) as never)
}

function hasBothLibraryBranches(sql: string) {
  const [watchBranch = '', plexBranch = ''] = sql.split(') or ')
  return watchBranch.includes('from "app"."watches"') && watchBranch.includes('"watches"."deleted_at" is null') && watchBranch.includes('"watches"."user_id" = $')
    && plexBranch.includes('from "app"."plex_items"') && plexBranch.includes('"plex_connections"."user_id" = $') && plexBranch.includes('"plex_items"."title_id" is not null')
}

beforeEach(() => {
  renderedWheres.length = 0
  vi.stubGlobal('db', fakeDb)
  vi.stubGlobal('withQuerySpan', (_name: string, fn: () => Promise<unknown>) => fn())
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('requireUserSession', () => Promise.resolve({ user: { id: 7 } }))
})

describe('soft-deleted watches are hidden from reads', () => {
  it('loadUserLibrary filters the watches it loads and the watched-title subquery', async () => {
    const { loadUserLibrary } = await import('~~/server/utils/library/loadUserLibrary')

    await loadUserLibrary(7)

    const watchFilters = renderedWheres.filter(sql => sql.includes('"watches"."user_id"') || sql.includes('"watches"."deleted_at"'))
    expect(watchFilters.length).toBeGreaterThan(0)
    for (const sql of watchFilters) expect(sql).toContain('"watches"."deleted_at" is null')
  })

  it.each([
    ['titles', '"app"."titles"."id"'],
    ['episodes', '"app"."episodes"."title_id"']
  ])('loadUserLibrary %s query matches both live-watch titles and the user\'s matched Plex item titles', async (_name, column) => {
    const { loadUserLibrary } = await import('~~/server/utils/library/loadUserLibrary')

    await loadUserLibrary(7)

    expect(renderedWheres.filter(sql => sql.startsWith(`(${column} in (select`) && hasBothLibraryBranches(sql))).toHaveLength(1)
  })

  it('import status counts titles from both live watches and the user\'s matched Plex items', async () => {
    const handler = (await import('~~/server/api/import/status.get')).default as (e: unknown) => Promise<unknown>

    await handler({})

    expect(renderedWheres.filter(sql => sql.startsWith('("app"."titles"."id" in (select') && hasBothLibraryBranches(sql))).toHaveLength(1)
  })

  it('failedTitleIdsFor ignores titles whose only watches are soft-deleted', async () => {
    const { failedTitleIdsFor } = await import('~~/server/utils/import/writePlays')

    await failedTitleIdsFor(7)

    expect(renderedWheres).toHaveLength(1)
    expect(renderedWheres[0]).toContain('"watches"."deleted_at" is null')
  })
})
