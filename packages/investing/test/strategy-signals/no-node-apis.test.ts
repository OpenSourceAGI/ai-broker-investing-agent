import { it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

it("keeps strategy modules independent of Node APIs and vendored runtime imports", () => {
  function scan(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) scan(p);
      else if (p.endsWith(".ts"))
        expect(readFileSync(p, "utf8")).not.toMatch(
          /\bnode:|\bprocess\.|from\s+['"](?:fs|path|child_process|.*third-party-trading-bots)/,
        );
    }
  }
  scan(new URL("../../src/strategy-signals", import.meta.url).pathname);
});
