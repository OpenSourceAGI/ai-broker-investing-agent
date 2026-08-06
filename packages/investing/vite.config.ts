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
        "predictos/index": resolve(__dirname, "src/predictos/index.ts"),
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        `${entryName}.${format === "es" ? "mjs" : "js"}`,
    },
    rollupOptions: {
      external: [
        "react", "react-dom", "next",
        "axios", "csv-parse", "date-fns", "dotenv", "drizzle-orm",
        "ethers", "indicatorts", "langchain", "nanoid",
        "sec-edgar-toolkit", "xgboost_node", "zod",
        "@polymarket/clob-client",
        // Optional peer deps used only by the x402 Solana payment path
        "@solana/web3.js", "@solana/spl-token", "bs58",
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
