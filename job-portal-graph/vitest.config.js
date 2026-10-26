import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // All test files live under tests/
    include: ['tests/**/*.test.js'],
    // Use the node environment (not jsdom)
    environment: 'node',
    setupFiles: ['./tests/helpers/setup.js'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
