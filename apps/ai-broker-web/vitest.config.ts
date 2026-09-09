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
