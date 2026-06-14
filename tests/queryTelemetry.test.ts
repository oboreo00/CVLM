import { describe, expect, it } from "vitest";
import { buildQueryTelemetry } from "../server/services/queryTelemetry.ts";
import { QUERY_ROUTES, REPLAN_TOOLS } from "@shared/queryRoutes";

describe("queryTelemetry", () => {
  it("fills required query_log fields when replan body telemetry is sparse", () => {
    const telemetry = buildQueryTelemetry(
      QUERY_ROUTES.LOCAL_RAG,
      {
        totalDurationMs: 420,
        stepDurations: { analysis: 1, embedding: 50, synthesis: 120, replanGate: 5 },
        relevanceScore: 0.42,
        embeddingCacheHit: true,
        promptTokens: 100,
        completionTokens: 12,
        totalTokens: 112,
      },
      { route: QUERY_ROUTES.LOCAL_RAG, replanTool: REPLAN_TOOLS.RETRY_RETRIEVAL },
      {
        tool: REPLAN_TOOLS.RETRY_RETRIEVAL,
        reason: "decent_relevance_retry",
        confidence: 0.8,
        source: "heuristic",
      },
    );

    expect(telemetry.relevanceScore).toBe(0.42);
    expect(telemetry.modelsUsed).toEqual({
      synthesis: expect.any(String),
      analysis: QUERY_ROUTES.LOCAL_RAG,
      embedding: expect.any(String),
    });
    expect(telemetry.cacheStatus).toEqual({
      embeddingHit: true,
      webSearchHit: false,
      responseHit: false,
    });
    expect(telemetry.promptTokens).toBe(100);
    expect(telemetry.completionTokens).toBe(12);
    expect(telemetry.totalTokens).toBe(112);
    expect(telemetry.provider).toBeTruthy();
    expect(telemetry.replanTool).toBe(REPLAN_TOOLS.RETRY_RETRIEVAL);
  });

  it("preserves hybrid fallback telemetry from performUncertaintyFallback", () => {
    const hybridTelemetry = {
      route: QUERY_ROUTES.HYBRID_WEB_FALLBACK,
      relevanceScore: 0.05,
      provider: "GCP Vertex AI",
      modelsUsed: { synthesis: "gemini-flash", analysis: "gemini-flash-lite", embedding: "gemini-embedding-2" },
      cacheStatus: { embeddingHit: false, webSearchHit: true, responseHit: false },
      promptTokens: 500,
      completionTokens: 80,
      totalTokens: 580,
      stepDurations: { searchRewrite: 200, webExecution: 800, synthesis: 400 },
    };

    const telemetry = buildQueryTelemetry(
      QUERY_ROUTES.HYBRID_WEB_FALLBACK,
      {
        totalDurationMs: 1500,
        stepDurations: { analysis: 1, embedding: 40 },
        relevanceScore: 0.05,
        embeddingCacheHit: false,
      },
      hybridTelemetry,
    );

    expect(telemetry.promptTokens).toBe(500);
    expect(telemetry.cacheStatus).toEqual(hybridTelemetry.cacheStatus);
    expect(telemetry.modelsUsed).toEqual(hybridTelemetry.modelsUsed);
    expect(telemetry.stepDurations).toMatchObject({
      analysis: 1,
      embedding: 40,
      searchRewrite: 200,
      webExecution: 800,
      synthesis: 400,
    });
  });
});
