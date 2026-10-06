import { it, expect } from "vitest";
import { toExecutableCents } from "../../src/strategy-signals/execution";

it.each([50, 50.0000000001, 50 + (0.1 + 0.2 - 0.3)])("accepts floating noise %s", (v) =>
  expect(toExecutableCents(v)).toBe(50),
);
it.each([49.9, 0.1 + 0.2, NaN, Infinity, -1, 101])("rejects unrepresentable or invalid %s", (v) =>
  expect(() => toExecutableCents(v)).toThrow(),
);
