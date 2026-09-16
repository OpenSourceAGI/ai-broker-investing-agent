import { describe, expect, it } from "vitest";
import { describeLogArg } from "../logger";

describe("describeLogArg", () => {
  it("keeps the message of an error better-auth would otherwise reduce to a stack", () => {
    const error = new Error("no such column: stripe_customer_id");

    const described = describeLogArg(error) as string;

    expect(described).toContain("Error: no such column: stripe_customer_id");
    expect(described).toContain(error.stack);
  });

  it("includes the cause, which is where D1 puts the SQLite error", () => {
    const error = new Error("D1_ERROR", { cause: new Error("no such column: trial_allowed") });

    expect(describeLogArg(error)).toContain("caused by Error: no such column: trial_allowed");
  });

  it("describes a non-error cause", () => {
    expect(describeLogArg(new Error("boom", { cause: "SQLITE_ERROR" }))).toContain(
      "caused by SQLITE_ERROR",
    );
  });

  it("passes non-errors through untouched", () => {
    const context = { userId: "u1" };

    expect(describeLogArg(context)).toBe(context);
    expect(describeLogArg("plain")).toBe("plain");
    expect(describeLogArg(undefined)).toBeUndefined();
  });
});
