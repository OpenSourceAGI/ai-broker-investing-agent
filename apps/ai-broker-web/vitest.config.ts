import { defineConfig } from "vitest/config";

/**
 * Unit tests for the app's plain-Node library code (the D1 read-replication
 * session wrapper in lib/db, for one). Kept separate from vite.config.ts,
 * which configures the vinext/Cloudflare build and would pull the Workers
 * plugins into the test run.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/__tests__/**/*.test.ts"],
    restoreMocks: true,
  },
});
