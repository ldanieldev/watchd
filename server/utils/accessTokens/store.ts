import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { accessTokens, users } from '~~/server/db/schema'
import type { AccessTokenSummary } from '~~/shared/types/accessTokens'
import { generateAccessToken, hashAccessToken } from './token'

const PG_UNIQUE_VIOLATION = '23505'

export class DuplicateAccessTokenNameError extends Error {
  constructor() {
    super('A token with that name already exists.')
  }
}

const summaryColumns = {
  id: accessTokens.id,
  name: accessTokens.name,
  prefix: accessTokens.prefix,
  createdAt: accessTokens.createdAt,
  lastUsedAt: accessTokens.lastUsedAt
}

type SummaryRow = { id: number, name: string, prefix: string, createdAt: Date, lastUsedAt: Date | null }

const toSummary = (row: SummaryRow): AccessTokenSummary => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  createdAt: row.createdAt.toISOString(),
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null
})

export async function createAccessToken(userId: number, name: string): Promise<AccessTokenSummary & { token: string }> {
  const { token, hash, prefix } = generateAccessToken()
  try {
    const [row] = await db.insert(accessTokens).values({ userId, name, tokenHash: hash, prefix }).returning(summaryColumns)
    return { ...toSummary(row!), token }
  } catch (error) {
    // Drizzle wraps the driver error, so read the Postgres code from error.cause before falling back to the error itself.
    const driverError = (error as { cause?: { code?: string } }).cause ?? error
    if ((driverError as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      throw new DuplicateAccessTokenNameError()
    }
    throw error
  }
}

export async function listAccessTokens(userId: number): Promise<AccessTokenSummary[]> {
  const rows = await db.select(summaryColumns).from(accessTokens)
    .where(eq(accessTokens.userId, userId))
    .orderBy(desc(accessTokens.createdAt), desc(accessTokens.id))
  return rows.map(toSummary)
}

export async function revokeAccessToken(userId: number, tokenId: number): Promise<boolean> {
  const deleted = await db.delete(accessTokens)
    .where(and(eq(accessTokens.id, tokenId), eq(accessTokens.userId, userId)))
    .returning({ id: accessTokens.id })
  return deleted.length > 0
}

export async function resolveAccessToken(token: string): Promise<{ tokenId: number, userId: number } | null> {
  const [row] = await db
    .select({ tokenId: accessTokens.id, userId: accessTokens.userId, isActive: users.isActive })
    .from(accessTokens)
    .innerJoin(users, eq(users.id, accessTokens.userId))
    .where(eq(accessTokens.tokenHash, hashAccessToken(token)))
    .limit(1)
  if (!row || row.isActive === false) return null
  return { tokenId: row.tokenId, userId: row.userId }
}

export async function touchAccessToken(tokenId: number): Promise<void> {
  await db.update(accessTokens)
    .set({ lastUsedAt: sql`now()` })
    .where(and(
      eq(accessTokens.id, tokenId),
      or(isNull(accessTokens.lastUsedAt), lt(accessTokens.lastUsedAt, sql`now() - interval '60 seconds'`))
    ))
}
