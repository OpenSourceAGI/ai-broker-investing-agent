import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as strategySignals from "../../src/strategy-signals";
import { registeredSources, sourceRegistry } from "../../src/strategy-signals/registry";

const notices = readFileSync(new URL("../../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");
const ids = registeredSources.map((entry) => entry.source.id);

it("registers each source once, keyed for GraphRun.sources", () => {
  expect(new Set(ids).size).toBe(ids.length);
  expect(Object.keys(sourceRegistry())).toEqual(ids);
  for (const entry of registeredSources) expect(sourceRegistry()[entry.source.id]).toBe(entry.source);
});

it("registers every source the module exports, so none ships without provenance", () => {
  const exported = (Object.values(strategySignals) as unknown[]).filter(
    (value): value is { id: string } =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { id?: unknown }).id === "string" &&
      typeof (value as { upstream?: unknown }).upstream === "string" &&
      typeof (value as { run?: unknown }).run === "function",
  );
  expect(exported.length).toBeGreaterThan(0);
  for (const source of exported) expect(ids).toContain(source.id);
});

it.each(registeredSources.map((entry) => [entry.source.id, entry] as const))(
  "%s provenance matches its upstream path and THIRD_PARTY_NOTICES.md",
  (_id, entry) => {
    expect(entry.source.upstream.startsWith(`${entry.upstreamRepo}/`)).toBe(true);
    if (entry.fidelity === "independent") {
      expect(entry.license).toBe("independent implementation");
      expect(entry.source.upstream).toContain("independent");
      const table = notices.slice(notices.indexOf("## Independently implemented contributions"));
      expect(table).toContain(`\`${entry.upstreamRepo}/`);
    } else {
      expect(entry.license).toMatch(/^MIT/);
      const ported = notices.slice(0, notices.indexOf("## Independently implemented contributions"));
      expect(ported).toContain(`\`${entry.upstreamRepo}/LICENSE\``);
    }
    if (entry.backtest === "daily-bars") expect(entry.venue).toBe("equity");
  },
);
