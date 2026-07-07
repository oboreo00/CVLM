import { AI_MODELS } from "./aiConfig.ts";
import type { QueryRoute } from "@shared/queryRoutes";
import {
  JUDGE_RATIONALE_MAX_LEN,
  type JudgeMode,
  type JudgeVerdict,
} from "@shared/judgeVerdict";
import type { LLMUsageMetadata } from "./llmAdapter.ts";

/** Per-step token counts stored under step_durations.tokens (no extra DB columns). */
export interface StepTokenCounts {
  prompt: number;
  completion: number;
  total: number;
}

export interface ModelsUsedTelemetry {
  synthesis?: string;
  analysis?: string;
  embedding?: string;
  judge?: string;
}

export interface ReplanTelemetryDecision {
  tool: string;
  reason: string;
  confidence: number;
  source?: string;
}

/** Populated when an LLM answer judge runs (shadow or live). */
export interface JudgeTelemetryDecision {
  verdict: JudgeVerdict;
  confidence: number;
  rationale?: string;
  mode?: JudgeMode;
  disagreedWithHeuristic?: boolean;
  usage?: LLMUsageMetadata;
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
  recoveryHint?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  intentClassifierUsage?: LLMUsageMetadata;
}

export function stepTokensFromUsage(
  usage?: LLMUsageMetadata,
): StepTokenCounts | undefined {
  if (!usage) return undefined;
  const prompt = usage.promptTokenCount ?? 0;
  const completion = usage.candidatesTokenCount ?? 0;
  const total = usage.totalTokenCount ?? prompt + completion;
  if (prompt === 0 && completion === 0 && total === 0) return undefined;
  return { prompt, completion, total };
}

function sumStepTokenRecords(steps: Record<string, StepTokenCounts>): StepTokenCounts {
  return Object.values(steps).reduce(
    (acc, step) => ({
      prompt: acc.prompt + step.prompt,
      completion: acc.completion + step.completion,
      total: acc.total + step.total,
    }),
    { prompt: 0, completion: 0, total: 0 },
  );
}

function buildTokenBreakdown(
  base: QueryTelemetryBase,
  bodyTelemetry: Record<string, unknown> | undefined,
  judgeDecision?: JudgeTelemetryDecision,
): Record<string, StepTokenCounts> {
  const tokens: Record<string, StepTokenCounts> = {};

  const intent = stepTokensFromUsage(base.intentClassifierUsage);
  if (intent) tokens.intent = intent;

  const synthesis = stepTokensFromUsage({
    promptTokenCount: base.promptTokens,
    candidatesTokenCount: base.completionTokens,
    totalTokenCount: base.totalTokens,
  });
  if (synthesis) tokens.synthesis = synthesis;

  const judge = stepTokensFromUsage(judgeDecision?.usage);
  if (judge) tokens.judge = judge;

  const bodyPrompt = bodyTelemetry?.promptTokens as number | undefined;
  const bodyCompletion = bodyTelemetry?.completionTokens as number | undefined;
  const bodyTotal = bodyTelemetry?.totalTokens as number | undefined;
  if (bodyPrompt != null && bodyPrompt > 0) {
    const hybrid: StepTokenCounts = {
      prompt: bodyPrompt,
      completion: bodyCompletion ?? 0,
      total: bodyTotal ?? bodyPrompt + (bodyCompletion ?? 0),
    };
    // Replan/hybrid pipeline tokens are separate from the initial local synthesis pass.
    tokens.hybrid = hybrid;
  }

  return tokens;
}

function buildModelsUsedTelemetry(
  base: QueryTelemetryBase,
  bodyTelemetry: Record<string, unknown> | undefined,
  route: QueryRoute,
  judgeDecision?: JudgeTelemetryDecision,
): ModelsUsedTelemetry {
  const fromBody = bodyTelemetry?.modelsUsed as ModelsUsedTelemetry | undefined;

  return {
    synthesis:
      fromBody?.synthesis ??
      base.synthesisModel ??
      AI_MODELS.DEFAULT_ANSWERING_FALLBACKS[0],
    analysis:
      fromBody?.analysis ?? base.analysisLabel ?? base.intentLabel ?? route,
    embedding: fromBody?.embedding ?? AI_MODELS.EMBEDDING,
    ...(judgeDecision?.usage ? { judge: AI_MODELS.FAST_WORKHORSE } : {}),
  };
}

function mergeStepDurationsWithTokens(
  base: QueryTelemetryBase,
  bodyTelemetry: Record<string, unknown> | undefined,
  judgeDecision?: JudgeTelemetryDecision,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...((bodyTelemetry?.stepDurations as Record<string, unknown> | undefined) ?? {}),
    ...base.stepDurations,
  };
  delete merged.tokens;

  const tokenBreakdown = buildTokenBreakdown(base, bodyTelemetry, judgeDecision);
  if (Object.keys(tokenBreakdown).length > 0) {
    merged.tokens = tokenBreakdown;
  }

  return merged;
}

function truncateJudgeRationale(rationale: string | undefined): string | undefined {
  if (rationale == null) return undefined;
  const trimmed = rationale.trim();
  if (trimmed.length <= JUDGE_RATIONALE_MAX_LEN) return trimmed;
  return `${trimmed.slice(0, JUDGE_RATIONALE_MAX_LEN - 1)}…`;
}

function pickJudgeTelemetryFields(log: Record<string, unknown>) {
  const judgeVerdict = log.judgeVerdict as string | undefined;
  const judgeConfidence = log.judgeConfidence as number | undefined;
  const judgeRationale = log.judgeRationale as string | undefined;
  const judgeMode = log.judgeMode as string | undefined;
  const judgeDisagreedWithHeuristic = log.judgeDisagreedWithHeuristic as boolean | undefined;

  if (
    judgeVerdict == null &&
    judgeConfidence == null &&
    judgeRationale == null &&
    judgeMode == null &&
    judgeDisagreedWithHeuristic == null
  ) {
    return {};
  }

  return {
    judgeVerdict: judgeVerdict ?? null,
    judgeConfidence:
      judgeConfidence != null ? String(judgeConfidence) : null,
    judgeRationale: judgeRationale ?? null,
    judgeMode: judgeMode ?? null,
    judgeDisagreedWithHeuristic: judgeDisagreedWithHeuristic ?? null,
  };
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
    replanReason: (log.replanReason as string | undefined) ?? null,
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
    ...pickJudgeTelemetryFields(log),
  };
}

/** Fields required by query_logs insert (non-null for observability). */
export function buildQueryTelemetry(
  route: QueryRoute,
  base: QueryTelemetryBase,
  bodyTelemetry?: Record<string, unknown>,
  replanDecision?: ReplanTelemetryDecision,
  judgeDecision?: JudgeTelemetryDecision,
): Record<string, unknown> {
  const provider =
    (bodyTelemetry?.provider as string | undefined) ??
    (process.env.USE_VERTEX_AI === "true" ? "GCP Vertex AI" : "Google AI Studio");

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
  const recoveryHint =
    (typeof bodyTelemetry?.recoveryHint === "string" ? bodyTelemetry.recoveryHint : undefined) ??
    base.recoveryHint;

  const judgeVerdict =
    judgeDecision?.verdict ??
    (typeof bodyTelemetry?.judgeVerdict === "string" ? bodyTelemetry.judgeVerdict : undefined);
  const judgeConfidence =
    judgeDecision?.confidence ??
    (typeof bodyTelemetry?.judgeConfidence === "number" ? bodyTelemetry.judgeConfidence : undefined);
  const judgeRationale = truncateJudgeRationale(
    judgeDecision?.rationale ??
      (typeof bodyTelemetry?.judgeRationale === "string" ? bodyTelemetry.judgeRationale : undefined),
  );
  const judgeMode =
    judgeDecision?.mode ??
    (typeof bodyTelemetry?.judgeMode === "string" ? bodyTelemetry.judgeMode : undefined);
  const judgeDisagreedWithHeuristic =
    judgeDecision?.disagreedWithHeuristic ??
    (typeof bodyTelemetry?.judgeDisagreedWithHeuristic === "boolean"
      ? bodyTelemetry.judgeDisagreedWithHeuristic
      : undefined);

  const modelsUsed = buildModelsUsedTelemetry(base, bodyTelemetry, route, judgeDecision);
  const mergedStepDurations = mergeStepDurationsWithTokens(
    base,
    bodyTelemetry,
    judgeDecision,
  );
  const tokenBreakdown = mergedStepDurations.tokens as
    | Record<string, StepTokenCounts>
    | undefined;
  const rolledTokens =
    tokenBreakdown && Object.keys(tokenBreakdown).length > 0
      ? sumStepTokenRecords(tokenBreakdown)
      : {
          prompt: (bodyTelemetry?.promptTokens as number | undefined) ?? base.promptTokens ?? 0,
          completion:
            (bodyTelemetry?.completionTokens as number | undefined) ??
            base.completionTokens ??
            0,
          total: (bodyTelemetry?.totalTokens as number | undefined) ?? base.totalTokens ?? 0,
        };

  return {
    route,
    totalDurationMs: base.totalDurationMs,
    stepDurations: mergedStepDurations,
    relevanceScore:
      (bodyTelemetry?.relevanceScore as number | undefined) ??
      parseFloat(base.relevanceScore.toFixed(3)),
    provider,
    modelsUsed,
    cacheStatus: (bodyTelemetry?.cacheStatus as Record<string, boolean> | undefined) ?? {
      embeddingHit: base.embeddingCacheHit,
      webSearchHit: base.webSearchHit ?? false,
      responseHit: base.responseHit ?? false,
    },
    promptTokens: rolledTokens.prompt,
    completionTokens: rolledTokens.completion,
    totalTokens: rolledTokens.total,
    ...(replanDecision && {
      replanTool: replanDecision.tool,
      replanReason: replanDecision.reason,
      replanConfidence: replanDecision.confidence,
      replanSource: replanDecision.source,
    }),
    ...(intentLabel ? { intentLabel } : {}),
    ...(intentSource ? { intentSource } : {}),
    ...(intentConfidence != null ? { intentConfidence } : {}),
    ...(recoveryHint ? { recoveryHint } : {}),
    ...(judgeVerdict ? { judgeVerdict } : {}),
    ...(judgeConfidence != null ? { judgeConfidence } : {}),
    ...(judgeRationale ? { judgeRationale } : {}),
    ...(judgeMode ? { judgeMode } : {}),
    ...(judgeDisagreedWithHeuristic != null ? { judgeDisagreedWithHeuristic } : {}),
  };
}
