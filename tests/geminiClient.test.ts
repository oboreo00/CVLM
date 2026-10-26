import { describe, expect, it } from "vitest";
import {
  extractGenerateText,
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

  it("skips thought parts and concatenates visible text", () => {
    expect(
      extractGenerateText({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: '{"scratch": true}' },
                { text: '{"intent":"factual_personal"}' },
              ],
            },
          },
        ],
      }),
    ).toBe('{"intent":"factual_personal"}');
  });

  it("prefers the SDK text getter when present", () => {
    expect(
      extractGenerateText({
        text: "visible answer",
        candidates: [{ content: { parts: [{ thought: true, text: "hidden" }] } }],
      }),
    ).toBe("visible answer");
  });

  it("detects classic uncertain answers", () => {
    expect(isUncertainAnswer("I don't know.")).toBe(true);
    expect(isUncertainAnswer("You led the platform team at Acme.")).toBe(false);
  });
});
