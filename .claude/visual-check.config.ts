import type { APIRequestContext } from '@playwright/test'

const checkUser = { name: 'Visual Check', email: 'visual-check@example.com', password: 'visual-check-dev-only' }

export default {
  async login({ api }: { api: APIRequestContext }) {
    const login = await api.post('/api/auth/login', { data: { email: checkUser.email, password: checkUser.password } })
    if (login.ok()) return
    const register = await api.post('/api/auth/register', { data: checkUser })
    if (!register.ok()) throw new Error(`register failed (${register.status()}): is bun dev running?`)
  },
  hiddenSelectors: ['devframes-dock-embedded', 'nuxt-devtools-inspect-panel', '#vue-tracer-overlay'],
  defaults: { widths: [390, 1280], browsers: ['chromium', 'firefox'], schemes: ['light', 'dark'] }
}
