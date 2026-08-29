export default defineAppConfig({
  ui: {
    // @ts-expect-error @nuxt/ui 4.11 declares CustomAppConfig['ui'] as the fully-resolved runtime theme,
    // which AppConfigInput inherits, so a partial colors object fails typecheck. Runtime merge is unaffected.
    colors: {
      primary: 'green',
      neutral: 'slate'
    }
  }
})
