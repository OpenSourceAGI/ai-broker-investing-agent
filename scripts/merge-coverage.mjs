#!/usr/bin/env node
/**
 * Merge every workspace's LCOV report into one repository-root report.
 *
 * Each workspace runs its own test runner, so `turbo run test:coverage` leaves
 * an `lcov.info` per workspace whose `SF:` paths are relative to *that*
 * workspace (`src/index.ts`, `lib/auth/admin.ts`, ...). Uploading those as-is
 * is ambiguous — `src/index.ts` exists in three packages — so Codecov can
 * attribute a file to the wrong workspace.
 *
 * This rewrites each `SF:` path to be relative to the repository root and
 * concatenates the reports into `coverage/lcov.info`, which is the single file
 * CI uploads.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Workspace directories, from the root package.json `workspaces` globs. */
function workspaceDirs() {
  const { workspaces = [] } = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );

  return workspaces.flatMap((pattern) => {
    // Every glob in this repo is a single `<dir>/*` level.
    const parent = pattern.replace(/\/\*$/, "");
    const parentPath = path.join(repoRoot, parent);
    if (!fs.existsSync(parentPath)) return [];

    return fs
      .readdirSync(parentPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.posix.join(parent, entry.name));
  });
}

/** Rewrite `SF:` paths in an LCOV report so they resolve from the repo root. */
function rebase(lcov, workspace) {
  return lcov.replace(/^SF:(.*)$/gm, (_match, file) => {
    const trimmed = file.trim();
    const relative = path.isAbsolute(trimmed)
      ? path.relative(repoRoot, trimmed)
      : path.posix.join(workspace, trimmed);
    return `SF:${relative.split(path.sep).join("/")}`;
  });
}

const merged = [];
const covered = [];

for (const workspace of workspaceDirs()) {
  const report = path.join(repoRoot, workspace, "coverage", "lcov.info");
  if (!fs.existsSync(report)) continue;

  const lcov = fs.readFileSync(report, "utf8");
  if (!lcov.trim()) continue;

  merged.push(rebase(lcov, workspace).trimEnd());
  covered.push(workspace);
}

if (merged.length === 0) {
  console.error(
    "[coverage] No workspace produced coverage/lcov.info.\n" +
      "  Run `bun run test:coverage` so the test runners emit their reports first.",
  );
  process.exit(1);
}

const outputPath = path.join(repoRoot, "coverage", "lcov.info");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${merged.join("\n")}\n`);

console.log(`[coverage] Merged ${covered.length} report(s) into coverage/lcov.info`);
for (const workspace of covered) console.log(`  - ${workspace}`);
