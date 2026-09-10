import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/**/__tests__/**/*.test.ts', 'app/**/__tests__/**/*.test.ts'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      // Only the server-side modules the vitest suite can actually reach.
      // Pages and client components are exercised by e2e, not here, so
      // including them would report a coverage number nothing measures.
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: ['**/__tests__/**', '**/*.d.ts', '**/*.gen.ts'],
      all: true,
    },
  },
  resolve: {
    // An array rather than a map: vite matches aliases in order, and a bare
    // `@/` prefix would otherwise swallow `@/packages/*`.
    alias: [
      { find: /^@\/packages\//, replacement: `${resolve(rootDir, '../../packages')}/` },
      { find: /^@\//, replacement: `${resolve(rootDir, '.')}/` },
    ],
  },
})
