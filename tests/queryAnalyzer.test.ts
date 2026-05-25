import { describe, expect, it } from "vitest";
import {
  analyzeQuestionStructure,
  getQuestionRelevanceScore,
} from "../server/services/queryAnalyzer.ts";

describe("queryAnalyzer", () => {
  describe("analyzeQuestionStructure", () => {
    it("treats last-job factual questions as simple, not complex or advice", () => {
      const s = analyzeQuestionStructure("What did I do in my last job?");
      expect(s.isComplex).toBe(false);
      expect(s.isAdviceQuestion).toBe(false);
      expect(s.isSimpleFactualLookup).toBe(true);
      expect(s.estimatedSubQuestions).toBe(1);
    });
  });

  describe("getQuestionRelevanceScore", () => {
    const questionEmbedding = [1, 0, 0];

    it("returns 0 when there are no documents", () => {
      expect(getQuestionRelevanceScore(questionEmbedding, [])).toBe(0);
    });

    it("scores higher when the best chunk aligns with the question", () => {
      const aligned = getQuestionRelevanceScore(
        [1, 0, 0],
        [{ id: 1, content: "match", embedding: [1, 0, 0] }],
        1,
      );
      const misaligned = getQuestionRelevanceScore(
        [1, 0, 0],
        [{ id: 2, content: "miss", embedding: [0, 1, 0] }],
        1,
      );

      expect(aligned).toBeCloseTo(1, 5);
      expect(misaligned).toBeCloseTo(0, 5);
      expect(aligned).toBeGreaterThan(misaligned);
    });

    it("uses top-K blending (max weighted more than average)", () => {
      const docs = [
        { id: 1, content: "best", embedding: [1, 0, 0] },
        { id: 2, content: "worst", embedding: [0, 1, 0] },
      ];

      const score = getQuestionRelevanceScore(questionEmbedding, docs, 2);
      // 60% max (1.0) + 40% avg (0.5) = 0.8
      expect(score).toBeCloseTo(0.8, 5);
    });
  });
});
