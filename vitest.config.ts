import { defineConfig } from 'vitest/config'

// Pin the timezone so date-boundary tests (daysAgo, same-day dedupe) are
// deterministic. America/New_York also exercises DST and a non-UTC offset.
process.env.TZ = 'America/New_York'

// Kept separate from vite.config.ts so the PWA plugin isn't loaded for tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: { TZ: 'America/New_York' },
  },
})
