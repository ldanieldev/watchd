import type { ConfigOptions } from '@nuxt/test-utils/playwright'
import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// Marks the e2e build so server/plugins/inngestGuard.ts accepts the dev Inngest keys; the test-utils Nitro server inherits it.
process.env.NUXT_E2E ??= '1'

export default defineConfig<ConfigOptions>({
  testDir: './test/e2e',
  // Without this Playwright resolves imports against the root tsconfig.json, which declares no paths, so ~~ would typecheck but fail at runtime.
  tsconfig: './tsconfig.e2e.json',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Each worker gets its own Nuxt build + Nitro server (the fixture is worker-scoped), so parallel workers multiply full app builds.
  workers: 1,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    nuxt: {
      rootDir: fileURLToPath(new URL('.', import.meta.url)),
      setupTimeout: 240000
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
