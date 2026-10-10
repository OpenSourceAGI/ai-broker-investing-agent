import { defineConfig } from "vite";
import { resolve } from "path";
import { readFileSync } from "node:fs";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    {
      name: "kalshi-momentum-attribution",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "prediction-markets/kalshi-momentum.LICENSE",
          source: readFileSync(resolve(__dirname, "src/prediction-markets/strategies/kalshi-momentum.LICENSE"), "utf8"),
        });
      },
    },
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
        "prediction-markets/index": resolve(__dirname, "src/prediction-markets/index.ts"),
        "trading-agents/index": resolve(__dirname, "src/trading-agents/index.ts"),
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) => `${entryName}.${format === "es" ? "mjs" : entryName === "index" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      output: { interop: "auto" },
      external: [
        "react", "react-dom", "next",
        "axios", "csv-parse", "date-fns", "dotenv", "drizzle-orm",
        "@polymarket/clob-client", "ethers", "indicatorts", "langchain", "nanoid",
        "sec-edgar-toolkit", "xgboost_node", "zod",
        "yahoo-finance2", "node-fetch",
      ],
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
