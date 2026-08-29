// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@sentry/nuxt/module',
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/hints',
    '@nuxt/test-utils',
    '@pinia/nuxt',
    'nuxt-auth-utils',
    'nuxt-zod'
  ],

  devtools: {
    enabled: true
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

  routeRules: {
    '/': { prerender: true }
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
  nuxtZod: {
    zodVersion: 'v4',
    schemas: {
      enabled: false,
      dir: 'shared/schemas'
    }
  },
  sentry: {
    autoInjectServerSentry: 'top-level-import',
    org: process.env.SENTRY_ORG,
    project: 'watchd',
    authToken: process.env.SENTRY_AUTH_TOKEN
  }
})
