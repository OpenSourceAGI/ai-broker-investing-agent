import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts, which is the library *build* config
// (terser + dts). Loading that one for tests pulls in plugins the test run
// does not need.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      // Everything under src/ except the hand-written entry point is emitted by
      // `openapi-ts`, so measuring it says nothing about how well this package
      // is tested.
      include: ['src/index.ts'],
      all: true,
    },
  },
});
