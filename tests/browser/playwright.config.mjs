import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  globalTimeout: 240000,
  outputDir: '../../test-results/browser',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: { browserName: 'chromium', serviceWorkers: 'block', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile-touch', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: 'reduced-motion', use: { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' } },
  ],
})
