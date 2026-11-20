import * as Sentry from '@sentry/nuxt'
import { isExpectedFailure } from './server/utils/expectedFailure'
import { redactEventQueryParams } from './server/utils/redactQueryParams'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Every category is listed because v11 collects any category left out of dataCollection.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
    genAI: { inputs: false, outputs: false },
    queues: false,
    graphQL: { document: false, variables: false }
  },
  beforeSend: (event, hint) => (isExpectedFailure(hint.originalException) ? null : redactEventQueryParams(event)),
  tracesSampleRate: 1.0
})
