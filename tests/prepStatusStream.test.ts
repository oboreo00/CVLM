import { describe, expect, it } from "vitest";
import { shouldConnectPrepStatusStream } from "@/lib/prepStatusStream";

describe("shouldConnectPrepStatusStream", () => {
  it("connects when status is none or pending", () => {
    expect(shouldConnectPrepStatusStream({ prepStatus: "none" })).toBe(true);
    expect(shouldConnectPrepStatusStream({ prepStatus: "pending" })).toBe(true);
    expect(shouldConnectPrepStatusStream(null)).toBe(true);
  });

  it("skips when ready with starter questions", () => {
    expect(
      shouldConnectPrepStatusStream({
        prepStatus: "ready",
        brief: { starterQuestions: ["What is my role?"] },
      }),
    ).toBe(false);
  });

  it("connects when ready but starters are missing", () => {
    expect(
      shouldConnectPrepStatusStream({ prepStatus: "ready", brief: { starterQuestions: [] } }),
    ).toBe(true);
  });

  it("skips when failed", () => {
    expect(shouldConnectPrepStatusStream({ prepStatus: "failed" })).toBe(false);
  });
});
