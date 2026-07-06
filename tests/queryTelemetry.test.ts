import { describe, expect, it } from "vitest";
import { buildQueryTelemetry, pickQueryLogFields } from "../server/services/queryTelemetry.ts";
import { JUDGE_MODES, JUDGE_VERDICTS } from "@shared/judgeVerdict.ts";
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
    expect(telemetry.route).toBe(QUERY_ROUTES.LOCAL_RAG);
  });

  it("pickQueryLogFields keeps route, intent, and replan for DB insert", () => {
    const row = pickQueryLogFields({
      question: "test?",
      queryMode: "core",
      route: QUERY_ROUTES.HYBRID_WEB_FALLBACK,
      intentLabel: "career_advice",
      replanTool: REPLAN_TOOLS.HYBRID_WEB,
      replanReason: "decent_relevance_retry",
      totalDurationMs: 100,
      modelsUsed: { synthesis: "x", analysis: "y", embedding: "z" },
    });
    expect(row.route).toBe(QUERY_ROUTES.HYBRID_WEB_FALLBACK);
    expect(row.intentLabel).toBe("career_advice");
    expect(row.replanTool).toBe(REPLAN_TOOLS.HYBRID_WEB);
    expect(row.replanReason).toBe("decent_relevance_retry");
  });

  it("pickQueryLogFields persists judge columns when present", () => {
    const row = pickQueryLogFields({
      question: "test?",
      queryMode: "core",
      totalDurationMs: 100,
      judgeVerdict: JUDGE_VERDICTS.NEEDS_HYBRID,
      judgeConfidence: 0.88,
      judgeRationale: "Advice question not answered by resume summary.",
      judgeMode: JUDGE_MODES.SHADOW,
      judgeDisagreedWithHeuristic: true,
    });
    expect(row.judgeVerdict).toBe(JUDGE_VERDICTS.NEEDS_HYBRID);
    expect(row.judgeConfidence).toBe("0.88");
    expect(row.judgeRationale).toBe("Advice question not answered by resume summary.");
    expect(row.judgeMode).toBe(JUDGE_MODES.SHADOW);
    expect(row.judgeDisagreedWithHeuristic).toBe(true);
  });

  it("omits judge columns from pickQueryLogFields when judge did not run", () => {
    const row = pickQueryLogFields({
      question: "test?",
      queryMode: "core",
      totalDurationMs: 100,
    });
    expect(row).not.toHaveProperty("judgeVerdict");
    expect(row).not.toHaveProperty("judgeMode");
  });

  it("buildQueryTelemetry accepts judgeDecision for future shadow/live wiring", () => {
    const telemetry = buildQueryTelemetry(
      QUERY_ROUTES.LOCAL_RAG,
      {
        totalDurationMs: 300,
        stepDurations: { synthesis: 100, judge: 45 },
        relevanceScore: 0.5,
        embeddingCacheHit: false,
      },
      undefined,
      undefined,
      {
        verdict: JUDGE_VERDICTS.SUFFICIENT,
        confidence: 0.91,
        rationale: "Concise but complete.",
        mode: JUDGE_MODES.SHADOW,
        disagreedWithHeuristic: true,
      },
    );

    expect(telemetry.judgeVerdict).toBe(JUDGE_VERDICTS.SUFFICIENT);
    expect(telemetry.judgeConfidence).toBe(0.91);
    expect(telemetry.judgeRationale).toBe("Concise but complete.");
    expect(telemetry.judgeMode).toBe(JUDGE_MODES.SHADOW);
    expect(telemetry.judgeDisagreedWithHeuristic).toBe(true);
    expect(telemetry.stepDurations).toMatchObject({ judge: 45 });
  });

  it("truncates long judge rationales before persistence", () => {
    const telemetry = buildQueryTelemetry(
      QUERY_ROUTES.LOCAL_RAG,
      {
        totalDurationMs: 100,
        stepDurations: {},
        relevanceScore: 0.5,
        embeddingCacheHit: false,
      },
      undefined,
      undefined,
      {
        verdict: JUDGE_VERDICTS.UNCERTAIN,
        confidence: 0.5,
        rationale: "x".repeat(600),
        mode: JUDGE_MODES.SHADOW,
      },
    );

    expect((telemetry.judgeRationale as string).length).toBeLessThanOrEqual(500);
    expect((telemetry.judgeRationale as string).endsWith("…")).toBe(true);
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
