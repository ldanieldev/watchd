import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// Both reach us transitively (@nuxt/image -> ipx -> srvx, h3 -> uncrypto), so resolve defensively rather than assume.
function resolveBunConditionEntries() {
  const require = createRequire(import.meta.url)
  const tryResolve = (resolve: () => string) => {
    try {
      return [resolve()]
    } catch {
      return []
    }
  }
  return [
    ...tryResolve(() => require.resolve('srvx/bun')),
    ...tryResolve(() => join(dirname(require.resolve('uncrypto')), 'crypto.web.mjs'))
  ]
}

const uploadSourcemaps = process.env.SENTRY_UPLOAD_SOURCEMAPS === 'true'

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=15552000'
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@sentry/nuxt/module',
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/hints',
    '@nuxt/image',
    '@nuxt/test-utils',
    '@pinia/nuxt',
    'nuxt-auth-utils'
  ],

  $development: {
    runtimeConfig: {
      session: {
        cookie: {
          // Browsers only exempt localhost from the Secure attribute, so a LAN-IP dev host drops the session cookie.
          secure: false
        }
      }
    },
    vite: {
      server: {
        allowedHosts: true
      }
    }
  },

  $production: {
    routeRules: {
      '/**': { headers: SECURITY_HEADERS }
    }
  },

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
    // Values come from NUXT_* env at boot; reading process.env here would bake secrets into .output.
    meili: {
      host: '',
      apiKey: ''
    },
    tmdbApiKey: '',
    public: {
      appName: process.env.APP_NAME || 'Watchd',
      sentry: {
        dsn: process.env.SENTRY_DSN,
        environment: process.env.SENTRY_ENVIRONMENT ?? '',
        replay: false
      }
    }
  },

  sourcemap: { client: uploadSourcemaps ? 'hidden' : false },
  compatibilityDate: '2026-06-30',

  nitro: {
    externals: {
      // Sentry inlines ioredis and pg but not these deps, left external they break (Bun: `new Deque` throws; Node ESM: extensionless `xtend/mutable`), so inline them too.
      inline: ['denque', 'xtend'],
      // Nitro copies only `node`-condition files but `bun --bun` loads `bun` ones; absolute, or nft sees bare names.
      traceInclude: resolveBunConditionEntries()
    }
  },

  vite: {
    optimizeDeps: {
      include: ['zod']
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  sentry: {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT || 'watchd',
    authToken: process.env.SENTRY_AUTH_TOKEN,
    sourcemaps: {
      // Ungated, every production build uploads maps and cuts a release, including the one Playwright makes per e2e run.
      disable: !uploadSourcemaps,
      // Setting sourcemap.client ourselves turns off the module's post-upload deletion, so name the public maps.
      filesToDeleteAfterUpload: ['.*/**/public/**/*.map']
    },
    telemetry: false
  }
})
