import { defineConfig } from "@hey-api/openapi-ts";

export const baseUrl =
  process.env.API_URL || "https://autoinvestment.broker/api";

export const config = {
  input: "../../apps/ai-broker-web/content/docs/ai-broker-openapi.json",
  output: "./src",
  plugins: [
    {
      name: "@hey-api/client-fetch",
      runtimeConfigPath: "../baseurl.ts",
    },
  ],
};

export default defineConfig(config);
