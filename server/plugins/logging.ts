import * as Sentry from '@sentry/nuxt'
import { logger } from '~~/shared/utils/logger'

declare module 'h3' {
  interface H3EventContext {
    requestId?: string
  }
}

export default defineNitroPlugin((nitroApp) => {
  // wrapConsole, not wrapAll: wrapAll() also swaps process.stdout.write, which the reporter writes straight back through.
  if (!import.meta.dev) logger.wrapConsole()

  nitroApp.hooks.hook('request', (event) => {
    event.context.requestId = crypto.randomUUID()
    // Lands on the per-request isolation scope forked by @sentry/nuxt's h3 handler patch, not shared across requests.
    Sentry.setTag('requestId', event.context.requestId)
  })

  nitroApp.hooks.hook('error', (error, { event }) => {
    // @sentry/nuxt's own 'error' hook already captured this; this line only sequences the failure for the Loki narrative.
    const status = (error as { statusCode?: number }).statusCode ?? 500
    const log = logger.withTag('nitro')
    const fields = {
      url: event?.path,
      status,
      requestId: event?.context?.requestId
    }

    // 4xx are handled outcomes, so they stay off the `level=error` label Grafana alerts on — matching what Sentry drops.
    if (status >= 500) {
      log.error(error.message, fields)
    } else {
      log.warn(error.message, fields)
    }
  })
})
