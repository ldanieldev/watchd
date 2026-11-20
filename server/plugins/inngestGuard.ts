import { inngestProductionProblems } from '../utils/inngest/productionGuard'
import { logger } from '../utils/logger'

// With dev mode or a guessable key, anyone who reaches /api/inngest can run any function as any user.
export default defineNitroPlugin(() => {
  // The e2e production build runs on the dev .env; playwright.config.ts sets NUXT_E2E only there.
  if (import.meta.dev || import.meta.prerender || process.env.NUXT_E2E === '1') return
  const problems = inngestProductionProblems(process.env)
  if (problems.length) {
    logger.fatal({ problems }, 'refusing to start: Inngest is not production-safe')
    throw new Error(`Refusing to start in production: ${problems.join('; ')}. See README "Deployment".`)
  }
})
