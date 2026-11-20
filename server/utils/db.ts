import * as Sentry from '@sentry/nuxt'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../db/schema'
import { logger } from './logger'
import { recordQueryDuration } from './metrics'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
})

// An idle client dropped by a Postgres restart emits 'error' on the pool, which crashes the process when unhandled.
pool.on('error', err => logger.warn({ err }, 'idle Postgres client error'))

export const db = drizzle({ client: pool, schema })

// Sentry.startSpan, not the raw OpenTelemetry tracer: Sentry v11 ignores @opentelemetry/api spans unless it owns the provider.
export async function withQuerySpan<T>(opName: string, fn: () => Promise<T>): Promise<T> {
  return Sentry.startSpan(
    { name: opName, op: 'db.query', attributes: { 'db.system.name': 'postgresql' } },
    async () => {
      const start = performance.now()
      let outcome = 'ok'
      try {
        return await fn()
      } catch (err) {
        outcome = 'error'
        throw err
      } finally {
        recordQueryDuration((performance.now() - start) / 1000, {
          'db.operation.name': opName,
          'db.response.status_code': outcome
        })
      }
    }
  )
}
