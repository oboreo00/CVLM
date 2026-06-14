import { afterEach, describe, expect, it } from "vitest";
import {
  decideReplanTool,
  isLowRelevance,
  isReplanGateEnabled,
  LOW_RELEVANCE_THRESHOLD,
  type ReplanGateInput,
} from "../server/services/queryReplanGate.ts";
import { REPLAN_TOOLS } from "@shared/queryRoutes";

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

  describe("isLowRelevance", () => {
    it("is true when there are no chunks", () => {
      expect(isLowRelevance({ relevanceScore: 0.5, hasLocalChunks: false })).toBe(true);
    });

    it("is true below the threshold", () => {
      expect(
        isLowRelevance({
          relevanceScore: LOW_RELEVANCE_THRESHOLD - 0.01,
          hasLocalChunks: true,
        }),
      ).toBe(true);
    });

    it("is false at decent relevance with chunks", () => {
      expect(isLowRelevance({ relevanceScore: 0.5, hasLocalChunks: true })).toBe(false);
    });
  });

  describe("decideReplanTool routing tree", () => {
    it("needsWeb → hybrid_web", () => {
      const decision = decideReplanTool(
        baseInput({
          needsWeb: true,
          trigger: "needs_web_intent",
          localAnswer: "",
        }),
      );
      expect(decision.tool).toBe(REPLAN_TOOLS.HYBRID_WEB);
      expect(decision.reason).toBe("needs_web_skip_local");
      expect(decision.source).toBe("intent");
    });

    it("low relevance + factual → retry_retrieval", () => {
      const decision = decideReplanTool(
        baseInput({
          needsWeb: false,
          trigger: "low_relevance",
          isAdviceQuestion: false,
          isSimpleFactualLookup: true,
          intentLabel: "factual_personal",
          relevanceScore: 0.05,
          localAnswer: "",
        }),
      );
      expect(decision.tool).toBe(REPLAN_TOOLS.RETRY_RETRIEVAL);
      expect(decision.reason).toBe("low_relevance_retry");
    });

    it("low relevance + career advice → hybrid_web", () => {
      const decision = decideReplanTool(
        baseInput({
          needsWeb: false,
          trigger: "low_relevance",
          intentLabel: "career_advice",
          relevanceScore: 0.05,
          localAnswer: "",
        }),
      );
      expect(decision.tool).toBe(REPLAN_TOOLS.HYBRID_WEB);
      expect(decision.reason).toBe("low_relevance_hybrid");
    });

    it("low relevance + off_domain → hybrid_web", () => {
      const decision = decideReplanTool(
        baseInput({
          needsWeb: false,
          trigger: "low_relevance",
          intentLabel: "off_domain",
          relevanceScore: 0.05,
          localAnswer: "",
        }),
      );
      expect(decision.tool).toBe(REPLAN_TOOLS.HYBRID_WEB);
      expect(decision.reason).toBe("low_relevance_off_domain");
    });

    it("uncertain factual local answer → retry_retrieval", () => {
      const decision = decideReplanTool(
        baseInput({
          needsWeb: false,
          trigger: "uncertain_local_answer",
          isAdviceQuestion: false,
          isSimpleFactualLookup: true,
          intentLabel: "factual_personal",
          relevanceScore: 0.5,
          localAnswer: "I don't know.",
        }),
      );
      expect(decision.tool).toBe(REPLAN_TOOLS.RETRY_RETRIEVAL);
      expect(decision.reason).toBe("uncertain_local_retry");
    });

    it("uncertain advice local answer → hybrid_web", () => {
      const decision = decideReplanTool(
        baseInput({
          needsWeb: false,
          trigger: "uncertain_local_answer",
          relevanceScore: 0.5,
          localAnswer: "The provided text does not state whether you can become an EM.",
        }),
      );
      expect(decision.tool).toBe(REPLAN_TOOLS.HYBRID_WEB);
      expect(decision.reason).toBe("uncertain_local_hybrid");
    });

    it("decent local answer → local_rag", () => {
      const decision = decideReplanTool(
        baseInput({
          needsWeb: false,
          trigger: "uncertain_local_answer",
          relevanceScore: 0.6,
          localAnswer: "You led the platform team at Acme from 2019 to 2022.",
        }),
      );
      expect(decision.tool).toBe(REPLAN_TOOLS.LOCAL_RAG);
      expect(decision.reason).toBe("local_sufficient");
    });
  });

  describe("isReplanGateEnabled", () => {
    it("defaults to enabled", () => {
      expect(isReplanGateEnabled()).toBe(true);
    });

    it("can be disabled via env", () => {
      process.env.REPLAN_GATE_ENABLED = "false";
      expect(isReplanGateEnabled()).toBe(false);
    });
  });
});
