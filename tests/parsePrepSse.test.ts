import { describe, expect, it } from "vitest";
import { extractPrepPayloadsFromSseBuffer } from "../client/src/lib/parsePrepSse.ts";

describe("extractPrepPayloadsFromSseBuffer", () => {
  it("parses complete SSE frames and leaves a partial buffer", () => {
    const buffer =
      'data: {"prepStatus":"pending"}\n\n' +
      'data: {"prepStatus":"ready","brief":{"starterQuestions":["Q1?"]}}\n\n' +
      'data: {"prep';

    const { payloads, remaining } = extractPrepPayloadsFromSseBuffer(buffer);

    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toEqual({ prepStatus: "pending" });
    expect(payloads[1]).toEqual({
      prepStatus: "ready",
      brief: { starterQuestions: ["Q1?"] },
    });
    expect(remaining).toBe('data: {"prep');
  });

  it("ignores malformed JSON lines", () => {
    const { payloads } = extractPrepPayloadsFromSseBuffer(
      "data: not-json\n\ndata: {\"prepStatus\":\"none\"}\n\n",
    );
    expect(payloads).toEqual([{ prepStatus: "none" }]);
  });

  it("ignores non-data lines", () => {
    const { payloads } = extractPrepPayloadsFromSseBuffer(
      ": keep-alive\n\ndata: {\"prepStatus\":\"failed\"}\n\n",
    );
    expect(payloads).toEqual([{ prepStatus: "failed" }]);
  });
});
