import { describe, expect, it } from "vitest";
import { RAG_ANSWER_MARKDOWN_CLASS } from "../client/src/components/AnswerMarkdown.tsx";

describe("AnswerMarkdown", () => {
  it("uses the rag-prefixed answer markdown class for CSS consistency", () => {
    expect(RAG_ANSWER_MARKDOWN_CLASS).toBe("rag-answer-markdown");
  });
});
