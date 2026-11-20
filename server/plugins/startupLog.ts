import { fileSinkActive, logger } from '../utils/logger'

const set = (value: unknown) => typeof value === 'string' ? value.trim() !== '' : Boolean(value)

export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  const config = useRuntimeConfig()
  logger.info(
    {
      logLevel: logger.level,
      fileSink: fileSinkActive,
      services: {
        redis: set(process.env.NUXT_REDIS_URL),
        meilisearch: set(config.meili.host),
        sentry: set(process.env.SENTRY_DSN),
        otel: process.env.ENABLE_OPENTELEMETRY === 'true'
      }
    },
    'server starting'
  )
})
