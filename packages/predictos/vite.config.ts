import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      include: ["src/**/*"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: "terser",
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        "ai/index": resolve(__dirname, "src/ai/index.ts"),
        "data/kalshi": resolve(__dirname, "src/data/kalshi.ts"),
        "data/polymarket": resolve(__dirname, "src/data/polymarket.ts"),
        "agents/index": resolve(__dirname, "src/agents/index.ts"),
        arbitrage: resolve(__dirname, "src/arbitrage.ts"),
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        `${entryName}.${format === "es" ? "mjs" : "js"}`,
    },
    rollupOptions: {
      external: ["ethers"],
    },
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true,
      },
      format: {
        comments: false,
      },
    },
  },
});
