import { describe, expect, it } from "vitest";
import {
  clearQueryOptionsForModeChange,
  shouldClearQueryOnModeChange,
} from "../client/src/lib/queryUiState.ts";

describe("queryUiState", () => {
  it("clears query UI when switching between core and session", () => {
    expect(shouldClearQueryOnModeChange("core", "session")).toBe(true);
    expect(clearQueryOptionsForModeChange("core", "session")).toEqual({
      clearQuestion: true,
    });
  });

  it("does not clear when mode is unchanged", () => {
    expect(shouldClearQueryOnModeChange("session", "session")).toBe(false);
    expect(clearQueryOptionsForModeChange("session", "session")).toBeNull();
  });
});
