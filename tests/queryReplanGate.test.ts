import { afterEach, describe, expect, it } from "vitest";
import {
  applyReplanGuardrails,
  parseReplanToolResponse,
  REPLAN_BORDERLINE_RELEVANCE,
  resolveReplanHeuristic,
  shouldInvokeReplanGate,
  type ReplanGateInput,
} from "../server/services/queryReplanGate.ts";
import { REPLAN_TOOLS } from "../server/services/queryRoutes.ts";

function baseInput(overrides: Partial<ReplanGateInput> = {}): ReplanGateInput {
  return {
    question: "Should I pivot to climate tech?",
    localAnswer: "I don't know based on the context.",
    relevanceScore: 0.2,
    isAdviceQuestion: true,
    isComplex: false,
    isSimpleFactualLookup: false,
    hasLocalChunks: true,
    trigger: "uncertain_local_answer",
    ...overrides,
  };
}

describe("queryReplanGate", () => {
  afterEach(() => {
    delete process.env.REPLAN_GATE_ENABLED;
  });

  describe("shouldInvokeReplanGate", () => {
    it("invokes on uncertain local answers when enabled", () => {
      expect(shouldInvokeReplanGate(baseInput())).toBe(true);
    });

    it("invokes on borderline relevance for non-factual questions", () => {
      expect(
        shouldInvokeReplanGate(
          baseInput({
            trigger: "borderline_relevance",
            relevanceScore: 0.2,
            isSimpleFactualLookup: false,
          }),
        ),
      ).toBe(true);
    });

    it("skips borderline relevance for simple factual lookups", () => {
      expect(
        shouldInvokeReplanGate(
          baseInput({
            trigger: "borderline_relevance",
            relevanceScore: 0.2,
            isSimpleFactualLookup: true,
          }),
        ),
      ).toBe(false);
    });

    it("skips borderline relevance below the gray zone", () => {
      expect(
        shouldInvokeReplanGate(
          baseInput({
            trigger: "borderline_relevance",
            relevanceScore: REPLAN_BORDERLINE_RELEVANCE.min - 0.01,
          }),
        ),
      ).toBe(false);
    });

    it("skips when REPLAN_GATE_ENABLED=false", () => {
      process.env.REPLAN_GATE_ENABLED = "false";
      expect(shouldInvokeReplanGate(baseInput())).toBe(false);
    });
  });

  describe("resolveReplanHeuristic", () => {
    it("routes simple factual lookups to retry without LLM", () => {
      const decision = resolveReplanHeuristic(
        baseInput({
          question: "What did I do in my last job?",
          isAdviceQuestion: false,
          isSimpleFactualLookup: true,
          relevanceScore: 0.5,
        }),
      );
      expect(decision?.tool).toBe(REPLAN_TOOLS.RETRY_RETRIEVAL);
      expect(decision?.source).toBe("heuristic");
    });

    it("routes advice questions to suggest_breakdown when relevance is not rock-bottom", () => {
      const decision = resolveReplanHeuristic(baseInput({ relevanceScore: 0.2 }));
      expect(decision?.tool).toBe(REPLAN_TOOLS.SUGGEST_BREAKDOWN);
    });

    it("routes advice with very low relevance to hybrid_web", () => {
      const decision = resolveReplanHeuristic(
        baseInput({ relevanceScore: REPLAN_BORDERLINE_RELEVANCE.min - 0.01 }),
      );
      expect(decision?.tool).toBe(REPLAN_TOOLS.HYBRID_WEB);
    });

    it("returns null in the gray zone for generic uncertain answers", () => {
      expect(
        resolveReplanHeuristic(
          baseInput({
            isAdviceQuestion: false,
            isComplex: false,
            isSimpleFactualLookup: false,
            relevanceScore: 0.2,
          }),
        ),
      ).toBeNull();
    });
  });

  describe("applyReplanGuardrails", () => {
    it("blocks hybrid_web for simple factual lookups", () => {
      const guarded = applyReplanGuardrails(
        { tool: REPLAN_TOOLS.HYBRID_WEB, reason: "model_choice", confidence: 0.9, source: "llm" },
        baseInput({ isSimpleFactualLookup: true, isAdviceQuestion: false }),
      );
      expect(guarded.tool).toBe(REPLAN_TOOLS.RETRY_RETRIEVAL);
      expect(guarded.source).toBe("guardrail");
    });

    it("blocks local_rag for advice questions", () => {
      const guarded = applyReplanGuardrails(
        { tool: REPLAN_TOOLS.LOCAL_RAG, reason: "model_choice", confidence: 0.9, source: "llm" },
        baseInput({ relevanceScore: 0.25 }),
      );
      expect(guarded.tool).toBe(REPLAN_TOOLS.SUGGEST_BREAKDOWN);
    });
  });

  describe("parseReplanToolResponse", () => {
    it("parses valid JSON tool choices", () => {
      const decision = parseReplanToolResponse(
        '{"tool":"hybrid_web","reason":"needs market context","confidence":0.82}',
      );
      expect(decision).toEqual({
        tool: REPLAN_TOOLS.HYBRID_WEB,
        reason: "needs market context",
        confidence: 0.82,
      });
    });

    it("rejects unknown tools", () => {
      expect(
        parseReplanToolResponse('{"tool":"call_mom","reason":"nope","confidence":1}'),
      ).toBeNull();
    });

    it("handles fenced JSON", () => {
      const decision = parseReplanToolResponse(
        '```json\n{"tool":"retry_retrieval","reason":"weak chunks","confidence":0.6}\n```',
      );
      expect(decision?.tool).toBe(REPLAN_TOOLS.RETRY_RETRIEVAL);
    });
  });
});
