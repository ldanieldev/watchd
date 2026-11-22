import { createHash, randomBytes } from 'node:crypto'

export const ACCESS_TOKEN_PREFIX = 'wd_'

const BEARER_HEADER = /^bearer (wd_[A-Za-z0-9_-]{43})$/i

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateAccessToken(): { token: string, hash: string, prefix: string } {
  const token = ACCESS_TOKEN_PREFIX + randomBytes(32).toString('base64url')
  return {
    token,
    hash: hashAccessToken(token),
    prefix: token.slice(ACCESS_TOKEN_PREFIX.length, ACCESS_TOKEN_PREFIX.length + 8)
  }
}

export function parseBearerToken(header: string): string | null {
  return BEARER_HEADER.exec(header.trim())?.[1] ?? null
}
