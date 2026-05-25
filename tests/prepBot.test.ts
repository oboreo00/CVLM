import { describe, expect, it } from "vitest";
import { buildChunkIndexSummary } from "../server/services/prepParser.ts";

describe("prepBot", () => {
  describe("buildChunkIndexSummary", () => {
    it("counts chunks and dedupes sections in stable order", () => {
      const summary = buildChunkIndexSummary([
        { content: "a", section: "skills", chunkIndex: 0 },
        { content: "b", section: "experience", chunkIndex: 1 },
        { content: "c", section: "experience", chunkIndex: 2 },
        { content: "d", section: "summary", chunkIndex: 3 },
      ]);

      expect(summary.count).toBe(4);
      expect(summary.sections).toEqual(["summary", "experience", "skills"]);
    });
  });
});
