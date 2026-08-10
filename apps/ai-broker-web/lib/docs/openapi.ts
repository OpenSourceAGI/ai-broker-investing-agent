import { createOpenAPI } from "fumadocs-openapi/server";

export const openapi = createOpenAPI({
  input: ["./content/docs/ai-broker-openapi.json"],
});
