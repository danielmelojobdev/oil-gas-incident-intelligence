import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Mobile tests cover the pure modules only (report HTML, links, formatting,
    // filter store). Anything that needs a React Native runtime is not unit-tested here.
    include: [
      'packages/**/test/**/*.test.ts',
      'apps/backend/test/**/*.test.ts',
      'apps/mobile/test/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/mobile/.expo/**', 'apps/mobile/dist/**'],
    globals: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['packages/domain/src/**', 'apps/backend/src/**', 'apps/mobile/src/**'],
    },
  },
});
