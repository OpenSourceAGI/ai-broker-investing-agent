// @ts-ignore
import { generateFiles } from "fumadocs-openapi/generator";
import { createOpenAPI } from "fumadocs-openapi/server";
import { join } from "node:path";

async function main() {
  const openapi = createOpenAPI({
    input: ["./content/docs/ai-broker-openapi.json"],
  });

  await generateFiles({
    openapi,
    outDir: join(process.cwd(), "content/docs/api-reference"),
    mode: "tag", // or "operation" | "file" | "custom"
    index: true,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
