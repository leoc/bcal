import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    alias: { '@shared': new URL('./src/shared', import.meta.url).pathname },
    testTimeout: 30_000,
  },
})
