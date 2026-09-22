import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts', 'apps/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@meow-analytics/shared': path.resolve(__dirname, './packages/shared/src'),
      '@meow-analytics/config': path.resolve(__dirname, './packages/config/src'),
      '@meow-analytics/database': path.resolve(__dirname, './packages/database/src'),
      '@meow-analytics/sdk': path.resolve(__dirname, './packages/sdk/src'),
    },
  },
});
