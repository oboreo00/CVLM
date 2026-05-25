import { describe, expect, it } from "vitest";
import { normalizePrepResult } from "../server/services/prepParser.ts";

const RESUME_SNIPPET = "Jane Doe\nSenior Engineer at Acme Corp";

describe("prepParser", () => {
  describe("normalizePrepResult", () => {
    it("parses valid prep JSON with chunks, profile, and brief", () => {
      const raw = {
        chunks: [
          {
            content: "Senior Engineer at Acme Corp",
            section: "experience",
            company: "Acme Corp",
            chunkIndex: 0,
          },
        ],
        profile: {
          name: "Jane Doe",
          title: "Senior Engineer",
          location: "Toronto",
        },
        brief: {
          summary: "Experienced engineer with platform focus.",
          proofPoints: ["Led migration at Acme"],
          starterQuestions: ["What did Jane build at Acme?"],
        },
      };

      const result = normalizePrepResult(raw, RESUME_SNIPPET);
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].company).toBe("Acme Corp");
      expect(result.profile.name).toBe("Jane Doe");
      expect(result.brief.starterQuestions).toContain("What did Jane build at Acme?");
    });

    it("falls back to single-chunk prep when JSON is invalid or empty", () => {
      const fromNull = normalizePrepResult(null, RESUME_SNIPPET);
      expect(fromNull.chunks).toHaveLength(1);
      expect(fromNull.chunks[0].content).toBe(RESUME_SNIPPET);

      const fromEmptyChunks = normalizePrepResult({ chunks: [] }, RESUME_SNIPPET);
      expect(fromEmptyChunks.chunks[0].section).toBe("summary");
      expect(fromEmptyChunks.brief.starterQuestions.length).toBeGreaterThan(0);
    });

    it("skips chunks with empty content and fills default starter questions", () => {
      const raw = {
        chunks: [{ content: "   ", section: "experience" }, { content: "Valid chunk", section: "skills" }],
        profile: {},
        brief: { summary: "Summary only", proofPoints: [], starterQuestions: [] },
      };

      const result = normalizePrepResult(raw, RESUME_SNIPPET);
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].content).toBe("Valid chunk");
      expect(result.brief.starterQuestions.length).toBeGreaterThan(0);
    });
  });
});
