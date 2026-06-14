import { afterEach, describe, expect, it } from "vitest";
import {
  applyIntentGuardrails,
  deriveRecoveryHint,
  heuristicQuestionStructure,
  parseQueryIntentResponse,
} from "../server/services/queryIntentClassifier.ts";
import { INTENT_LABELS, RECOVERY_HINTS } from "@shared/queryIntent";

describe("queryIntentClassifier", () => {
  afterEach(() => {
    delete process.env.QUERY_INTENT_LLM;
  });

  describe("heuristicQuestionStructure", () => {
    it("treats last-job questions as simple factual", () => {
      const s = heuristicQuestionStructure("What did I do in my last job?");
      expect(s.isSimpleFactualLookup).toBe(true);
      expect(s.isAdviceQuestion).toBe(false);
      expect(s.intentLabel).toBe(INTENT_LABELS.FACTUAL_PERSONAL);
    });

    it("treats certification questions as simple factual", () => {
      const s = heuristicQuestionStructure(
        "Did I have some special certificate with aws or google cloud?",
      );
      expect(s.isSimpleFactualLookup).toBe(true);
      expect(s.intentLabel).toBe(INTENT_LABELS.FACTUAL_PERSONAL);
    });

    it("does not treat should-I cert advice as simple factual", () => {
      const s = applyIntentGuardrails(
        heuristicQuestionStructure("Should I get an AWS certification?"),
        "Should I get an AWS certification?",
      );
      expect(s.isSimpleFactualLookup).toBe(false);
      expect(s.isAdviceQuestion).toBe(true);
      expect(s.intentLabel).toBe(INTENT_LABELS.CAREER_ADVICE);
    });
  });

  describe("parseQueryIntentResponse", () => {
    it("parses LLM JSON intent", () => {
      const parsed = parseQueryIntentResponse(
        `{"intent":"${INTENT_LABELS.FACTUAL_PERSONAL}","isSimpleFactualLookup":true,"isAdviceQuestion":false,"isComplex":false,"preferLocalRag":true,"needsWeb":false,"recoveryHint":"${RECOVERY_HINTS.RETRY_RETRIEVAL}","estimatedSubQuestions":1,"confidence":0.88}`,
      );
      expect(parsed?.intentLabel).toBe(INTENT_LABELS.FACTUAL_PERSONAL);
      expect(parsed?.isSimpleFactualLookup).toBe(true);
      expect(parsed?.recoveryHint).toBe(RECOVERY_HINTS.RETRY_RETRIEVAL);
    });
  });

  describe("deriveRecoveryHint", () => {
    it("suggests hybrid_web for career advice", () => {
      expect(
        deriveRecoveryHint({
          intentLabel: INTENT_LABELS.CAREER_ADVICE,
          needsWeb: true,
          isAdviceQuestion: true,
        }),
      ).toBe(RECOVERY_HINTS.HYBRID_WEB);
    });

    it("suggests retry_retrieval for factual personal", () => {
      expect(
        deriveRecoveryHint({
          intentLabel: INTENT_LABELS.FACTUAL_PERSONAL,
          isSimpleFactualLookup: true,
        }),
      ).toBe(RECOVERY_HINTS.RETRY_RETRIEVAL);
    });
  });
});
