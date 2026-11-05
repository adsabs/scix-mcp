import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/ai/**/*.test.ts'],
    testTimeout: 240000,
    hookTimeout: 60000,
    retry: 1,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  }
});
