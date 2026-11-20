import * as Sentry from '@sentry/nuxt'
import type { H3Event } from 'h3'
import { isExpectedFailure } from '../utils/expectedFailure'
import { recordRequestDuration } from '../utils/metrics'
import { logger } from '../utils/logger'
import { requestLogLevel, requestRoute } from '../utils/requestLog'

declare module 'h3' {
  interface H3EventContext {
    requestId?: string
  }
}

const stripQuery = (path: string) => path.split('?')[0] ?? path

// Under Bun, Sentry v11 records no http.server span (measured), so this wraps every request in one plus its own isolation scope.
export default defineNitroPlugin((nitroApp) => {
  // h3App is a Nitro internal with no public type; shape is h3 v1.
  const app = (nitroApp as unknown as { h3App: { handler: (event: H3Event) => unknown } }).h3App
  const inner = app.handler

  app.handler = (event: H3Event) => Sentry.withIsolationScope(() => {
    const method = event.method ?? 'UNKNOWN'
    const requestId = crypto.randomUUID()
    event.context.requestId = requestId
    Sentry.setTag('requestId', requestId)
    return Sentry.startSpan(
      {
        name: `${method} ${stripQuery(event.path)}`,
        op: 'http.server',
        forceTransaction: true,
        attributes: { 'http.request.method': method, requestId }
      },
      async (span) => {
        const start = performance.now()
        let status = 500
        let expected = false
        try {
          const body = await inner(event)
          status = getResponseStatus(event)
          return body
        } catch (error) {
          // Nitro stamps the response status from a thrown error only after this returns, so read it off the error.
          status = (error as { statusCode?: number }).statusCode ?? 500
          expected = isExpectedFailure(error)
          throw error
        } finally {
          const durationMs = performance.now() - start
          // The router matches inside `inner`, so the low-cardinality route only exists now.
          const route = requestRoute(event)
          span.updateName(`${method} ${route}`)
          span.setAttribute('http.route', route)
          span.setAttribute('http.response.status_code', status)
          recordRequestDuration(durationMs / 1000, {
            'http.route': route,
            'http.request.method': method,
            'http.response.status_code': status
          })
          const level = expected ? 'warn' : requestLogLevel(status, route, method)
          if (level) {
            logger[level]({ method, route, status, durationMs: Math.round(durationMs), requestId }, 'request')
          }
        }
      }
    )
  })
})
