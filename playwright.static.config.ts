import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// The same smoke, run against the STATIC EXPORT (out/ — build first) under both
// hosting models: `web` (Netlify-style, one HTML file per route) and `native`
// (Capacitor-style: every extensionless path serves the root index.html, so the
// smoke's cold loads to deep URLs exercise the in-app route recovery).
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: undefined },
  projects: [
    { name: 'web', use: { baseURL: 'http://localhost:4173' } },
    { name: 'native', use: { baseURL: 'http://localhost:4174' } },
  ],
  webServer: [
    { command: 'node scripts/serve-static.mjs web 4173', port: 4173, reuseExistingServer: !process.env.CI },
    { command: 'node scripts/serve-static.mjs native 4174', port: 4174, reuseExistingServer: !process.env.CI },
  ],
})
