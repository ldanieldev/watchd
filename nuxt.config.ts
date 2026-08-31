// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@sentry/nuxt/module',
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/hints',
    '@nuxt/test-utils',
    '@pinia/nuxt',
    'nuxt-auth-utils'
  ],

  devtools: {
    enabled: true
  },

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      appName: process.env.APP_NAME || 'Watchd',
      sentry: {
        dsn: process.env.SENTRY_DSN
      }
    }
  },

  sourcemap: { client: 'hidden' },
  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },
  sentry: {
    autoInjectServerSentry: 'top-level-import',
    org: process.env.SENTRY_ORG,
    project: 'watchd',
    authToken: process.env.SENTRY_AUTH_TOKEN,
    // Without this gate every production build uploads maps and cuts a release, including the one Playwright makes per e2e run.
    sourcemaps: { disable: process.env.SENTRY_UPLOAD_SOURCEMAPS !== 'true' },
    telemetry: false
  }
})
