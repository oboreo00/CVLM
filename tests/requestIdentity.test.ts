import { describe, expect, it } from "vitest";
import { ingestSchema, querySchema } from "@shared/schema";

describe("request identity", () => {
  it("drops a client-supplied userId from ingest and query bodies", () => {
    const ingest = ingestSchema.parse({
      text: "resume text",
      userId: "00000000-0000-4000-8000-000000000001",
    });
    const query = querySchema.parse({
      question: "What did I do?",
      queryMode: "session",
      userId: "00000000-0000-4000-8000-000000000001",
    });

    expect(ingest).toEqual({ text: "resume text" });
    expect(query).toEqual({ question: "What did I do?", queryMode: "session" });
    expect("userId" in ingest).toBe(false);
    expect("userId" in query).toBe(false);
  });
});
