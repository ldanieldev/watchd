import * as Sentry from '@sentry/nuxt'

const runtimeConfig = useRuntimeConfig()

Sentry.init({
  dsn: runtimeConfig.public.sentry.dsn,
  // Every field is set explicitly because the two ways of leaving one out differ:
  // an absent `dataCollection` key falls back to the deprecated `sendDefaultPii`
  // bridge (restrictive), while a present one — even `{}` — selects spec DEFAULTS,
  // which collect user info, cookies and HTTP bodies. v11 drops the bridge.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false
  },
  // Replay may only be enabled for the client-side
  integrations: [
    Sentry.replayIntegration()
  ],
  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for tracing.
  // We recommend adjusting this value in production
  // Learn more at
  // https://docs.sentry.io/platforms/javascript/configuration/options/#traces-sample-rate
  tracesSampleRate: 1.0,
  // Capture Replay for 10% of all sessions,
  // plus for 100% of sessions with an error
  // Learn more at
  // https://docs.sentry.io/platforms/javascript/session-replay/configuration/#general-integration-configuration
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0
})
