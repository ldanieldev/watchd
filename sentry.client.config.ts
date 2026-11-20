import * as Sentry from '@sentry/nuxt'

const runtimeConfig = useRuntimeConfig()
const replay = runtimeConfig.public.sentry.replay === true

Sentry.init({
  dsn: runtimeConfig.public.sentry.dsn,
  // Must be a string: `...options` spreads over the SDK fallback, so `undefined` makes events default to 'production'.
  environment: runtimeConfig.public.sentry.environment || (import.meta.dev ? 'development' : 'production'),
  // Every category is listed because v11 collects any category left out of dataCollection.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    graphQL: { document: false, variables: false }
  },
  integrations: replay ? [Sentry.replayIntegration()] : [],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: replay ? 0.1 : 0,
  replaysOnErrorSampleRate: replay ? 1.0 : 0
})
