import { count } from 'drizzle-orm'
import { users } from '~~/server/db/schema'
import { logger } from './logger'

let hasWarnedAboutInvalidMode = false

export function registrationOpen(userCount: number, mode = useRuntimeConfig().registration as string | undefined): boolean {
  if (mode === 'open') return true
  if (mode !== 'closed' && !hasWarnedAboutInvalidMode) {
    hasWarnedAboutInvalidMode = true
    logger.warn({ configured: mode }, 'NUXT_REGISTRATION is not open or closed; treating as closed')
  }
  return userCount === 0
}

export async function isRegistrationOpen(): Promise<boolean> {
  const [row] = await withQuerySpan('count-users', () => db.select({ total: count() }).from(users))
  return registrationOpen(row?.total ?? 0)
}
