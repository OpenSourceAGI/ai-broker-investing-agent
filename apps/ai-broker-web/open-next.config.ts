import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default configuration: ISR/data cache disabled (add an R2 incremental cache
// here later if revalidation on the edge is needed).
export default defineCloudflareConfig();
