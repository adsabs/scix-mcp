import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The e2e suite has its own config (vitest.e2e.config.ts); it spawns the
    // built server and needs build/ current, so keep it out of `pnpm test`.
    exclude: ['node_modules/**', 'build/**', 'test/e2e/**', 'test/ai/**'],
    // Avoid worker crashes in tinypool by running tests in a single thread
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'build/**',
        'test/**',
        '**/*.config.ts',
        '**/types.ts'
      ]
    }
  }
});
