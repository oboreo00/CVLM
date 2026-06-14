import { AI_MODELS } from "./aiConfig.ts";
import type { QueryRoute } from "@shared/queryRoutes";

export interface ReplanTelemetryDecision {
  tool: string;
  reason: string;
  confidence: number;
  source?: string;
}

export interface QueryTelemetryBase {
  totalDurationMs: number;
  stepDurations: Record<string, number>;
  relevanceScore: number;
  embeddingCacheHit: boolean;
  webSearchHit?: boolean;
  responseHit?: boolean;
  synthesisModel?: string;
  analysisLabel?: string;
  intentLabel?: string;
  intentSource?: string;
  intentConfidence?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** Maps telemetry + request fields to query_logs row shape. */
export function pickQueryLogFields(
  log: Record<string, unknown> & {
    question: string;
    queryMode: string;
    totalDurationMs: number;
  },
) {
  return {
    question: log.question,
    queryMode: log.queryMode,
    userId: log.userId as string | undefined,
    route: log.route as string | undefined,
    intentLabel: log.intentLabel as string | undefined,
    replanTool: (log.replanTool as string | undefined) ?? null,
    totalDurationMs: log.totalDurationMs,
    relevanceScore:
      log.relevanceScore != null ? String(log.relevanceScore) : undefined,
    modelsUsed: log.modelsUsed,
    stepDurations: log.stepDurations,
    cacheStatus: log.cacheStatus,
    promptTokens: log.promptTokens as number | undefined,
    completionTokens: log.completionTokens as number | undefined,
    totalTokens: log.totalTokens as number | undefined,
    provider: log.provider as string | undefined,
  };
}

/** Fields required by query_logs insert (non-null for observability). */
export function buildQueryTelemetry(
  route: QueryRoute,
  base: QueryTelemetryBase,
  bodyTelemetry?: Record<string, unknown>,
  replanDecision?: ReplanTelemetryDecision,
): Record<string, unknown> {
  const provider =
    (bodyTelemetry?.provider as string | undefined) ??
    (process.env.USE_VERTEX_AI === "true" ? "GCP Vertex AI" : "Google AI Studio");

  const mergedStepDurations = {
    ...((bodyTelemetry?.stepDurations as Record<string, number> | undefined) ?? {}),
    ...base.stepDurations,
  };

  const intentLabel =
    (typeof bodyTelemetry?.intentLabel === "string" ? bodyTelemetry.intentLabel : undefined) ??
    base.intentLabel;
  const intentSource =
    (typeof bodyTelemetry?.intentSource === "string" ? bodyTelemetry.intentSource : undefined) ??
    base.intentSource;
  const intentConfidence =
    (typeof bodyTelemetry?.intentConfidence === "number"
      ? bodyTelemetry.intentConfidence
      : undefined) ?? base.intentConfidence;

  return {
    route,
    totalDurationMs: base.totalDurationMs,
    stepDurations: mergedStepDurations,
    relevanceScore:
      (bodyTelemetry?.relevanceScore as number | undefined) ??
      parseFloat(base.relevanceScore.toFixed(3)),
    provider,
    modelsUsed: (bodyTelemetry?.modelsUsed as Record<string, string> | undefined) ?? {
      synthesis: base.synthesisModel ?? AI_MODELS.DEFAULT_ANSWERING_FALLBACKS[0],
      analysis: base.analysisLabel ?? base.intentLabel ?? route,
      embedding: AI_MODELS.EMBEDDING,
    },
    cacheStatus: (bodyTelemetry?.cacheStatus as Record<string, boolean> | undefined) ?? {
      embeddingHit: base.embeddingCacheHit,
      webSearchHit: base.webSearchHit ?? false,
      responseHit: base.responseHit ?? false,
    },
    promptTokens:
      (bodyTelemetry?.promptTokens as number | undefined) ?? base.promptTokens ?? 0,
    completionTokens:
      (bodyTelemetry?.completionTokens as number | undefined) ?? base.completionTokens ?? 0,
    totalTokens:
      (bodyTelemetry?.totalTokens as number | undefined) ?? base.totalTokens ?? 0,
    ...(replanDecision && {
      replanTool: replanDecision.tool,
      replanReason: replanDecision.reason,
      replanConfidence: replanDecision.confidence,
      replanSource: replanDecision.source,
    }),
    ...(intentLabel ? { intentLabel } : {}),
    ...(intentSource ? { intentSource } : {}),
    ...(intentConfidence != null ? { intentConfidence } : {}),
  };
}
