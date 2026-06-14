import { describe, expect, it } from "vitest";
import {
  isContextBoundAnswer,
  isUncertainAnswer,
} from "../server/services/geminiClient.ts";

describe("geminiClient answer detection", () => {
  it("detects context-bound hedges", () => {
    expect(
      isContextBoundAnswer(
        "The provided text does not state whether you can become an engineering manager next.",
      ),
    ).toBe(true);
    expect(isContextBoundAnswer("I don't know")).toBe(false);
  });

  it("detects classic uncertain answers", () => {
    expect(isUncertainAnswer("I don't know.")).toBe(true);
    expect(isUncertainAnswer("You led the platform team at Acme.")).toBe(false);
  });
});
