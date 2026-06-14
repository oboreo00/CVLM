import { afterEach, describe, expect, it } from "vitest";
import {
  applyIntentGuardrails,
  heuristicQuestionStructure,
  parseQueryIntentResponse,
} from "../server/services/queryIntentClassifier.ts";

describe("queryIntentClassifier", () => {
  afterEach(() => {
    delete process.env.QUERY_INTENT_LLM;
  });

  describe("heuristicQuestionStructure", () => {
    it("treats last-job questions as simple factual", () => {
      const s = heuristicQuestionStructure("What did I do in my last job?");
      expect(s.isSimpleFactualLookup).toBe(true);
      expect(s.isAdviceQuestion).toBe(false);
      expect(s.intentLabel).toBe("factual_personal");
    });

    it("treats certification questions as simple factual", () => {
      const s = heuristicQuestionStructure(
        "Did I have some special certificate with aws or google cloud?",
      );
      expect(s.isSimpleFactualLookup).toBe(true);
      expect(s.intentLabel).toBe("factual_personal");
    });

    it("does not treat should-I cert advice as simple factual", () => {
      const s = applyIntentGuardrails(
        heuristicQuestionStructure("Should I get an AWS certification?"),
        "Should I get an AWS certification?",
      );
      expect(s.isSimpleFactualLookup).toBe(false);
      expect(s.isAdviceQuestion).toBe(true);
      expect(s.intentLabel).toBe("career_advice");
    });
  });

  describe("parseQueryIntentResponse", () => {
    it("parses LLM JSON intent", () => {
      const parsed = parseQueryIntentResponse(
        '{"intent":"factual_personal","isSimpleFactualLookup":true,"isAdviceQuestion":false,"isComplex":false,"preferLocalRag":true,"needsWeb":false,"estimatedSubQuestions":1,"confidence":0.88}',
      );
      expect(parsed?.intentLabel).toBe("factual_personal");
      expect(parsed?.isSimpleFactualLookup).toBe(true);
    });
  });
});
