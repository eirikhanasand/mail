import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './tests',
    timeout: 30_000,
    expect: { timeout: 8_000 },
    fullyParallel: true,
    use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3010', trace: 'on-first-retry' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
