/**
 * Shadow LLM answer-quality judge — advisory only; does not change routing.
 * Set ANSWER_JUDGE_SHADOW=true to log verdicts on query_logs.
 */

import { performance } from "perf_hooks";
import {
  JUDGE_MODES,
  JUDGE_VERDICTS,
  isJudgeVerdict,
  type JudgeVerdict,
} from "@shared/judgeVerdict.ts";
import { withLLMRetries } from "./llmRetries.ts";
import { AI_MODELS } from "./aiConfig.ts";
import type { LLMAdapter, LLMUsageMetadata } from "./llmAdapter.ts";
import type { JudgeTelemetryDecision } from "./queryTelemetry.ts";

export interface AnswerJudgeInput {
  question: string;
  localAnswer: string;
  relevanceScore: number;
  contextPreview?: string;
}

export interface AnswerJudgeResult {
  verdict: JudgeVerdict;
  confidence: number;
  rationale?: string;
}

/** Set ANSWER_JUDGE_SHADOW=true to run advisory judge after local synthesis. */
export function isAnswerJudgeShadowEnabled(): boolean {
  return process.env.ANSWER_JUDGE_SHADOW === "true";
}

export function parseAnswerJudgeResponse(text: string): AnswerJudgeResult | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as {
      verdict?: string;
      confidence?: number;
      rationale?: string;
    };
    if (!parsed.verdict || !isJudgeVerdict(parsed.verdict)) return null;
    return {
      verdict: parsed.verdict,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.7,
      rationale:
        typeof parsed.rationale === "string" ? parsed.rationale.trim() : undefined,
    };
  } catch {
    return null;
  }
}

/** True when judge verdict conflicts with whether heuristics kept the local answer. */
export function judgeDisagreesWithHeuristic(
  heuristicKeptLocal: boolean,
  verdict: JudgeVerdict,
): boolean {
  const judgeSaysLocalOk = verdict === JUDGE_VERDICTS.SUFFICIENT;
  return heuristicKeptLocal ? !judgeSaysLocalOk : judgeSaysLocalOk;
}

async function classifyAnswerWithLlm(
  ai: LLMAdapter,
  input: AnswerJudgeInput,
): Promise<{ result: AnswerJudgeResult | null; usage?: LLMUsageMetadata }> {
  const verdictValues = Object.values(JUDGE_VERDICTS).join(" | ");
  const contextBlock = input.contextPreview?.trim()
    ? `Context preview:\n${input.contextPreview}\n\n`
    : "";

  const prompt = `Judge whether this resume RAG answer sufficiently addresses the question from local context alone. JSON only.

verdicts:
- ${JUDGE_VERDICTS.SUFFICIENT}: complete and grounded in the resume context
- ${JUDGE_VERDICTS.INSUFFICIENT_RETRIEVAL}: likely missing resume facts; better retrieval needed
- ${JUDGE_VERDICTS.NEEDS_HYBRID}: needs external knowledge (career advice, general facts not on resume)
- ${JUDGE_VERDICTS.UNCERTAIN}: cannot tell

Question: ${input.question}
Relevance score (0-1): ${input.relevanceScore.toFixed(3)}
${contextBlock}Answer:
${input.localAnswer}

{"verdict":"${verdictValues}","confidence":0.0-1.0,"rationale":"one short sentence"}`;

  const response = await withLLMRetries("shadowAnswerJudge", () =>
    ai.models.generateContent({
      model: AI_MODELS.FAST_WORKHORSE,
      contents: prompt,
    }),
  );

  const text =
    response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return {
    result: parseAnswerJudgeResponse(text),
    usage: response.usageMetadata,
  };
}

/** Runs shadow judge when enabled; returns telemetry fields and elapsed ms. */
export async function runShadowAnswerJudgeIfEnabled(
  ai: LLMAdapter,
  input: AnswerJudgeInput,
  heuristicKeptLocal: boolean,
): Promise<{ decision: JudgeTelemetryDecision | undefined; durationMs: number }> {
  if (!isAnswerJudgeShadowEnabled() || !input.localAnswer.trim()) {
    return { decision: undefined, durationMs: 0 };
  }

  const start = performance.now();
  try {
    const { result, usage } = await classifyAnswerWithLlm(ai, input);
    const durationMs = Math.round(performance.now() - start);
    if (!result) {
      console.warn("[AnswerJudge] Shadow judge parse failed");
      return { decision: undefined, durationMs };
    }

    const decision: JudgeTelemetryDecision = {
      verdict: result.verdict,
      confidence: result.confidence,
      rationale: result.rationale,
      mode: JUDGE_MODES.SHADOW,
      disagreedWithHeuristic: judgeDisagreesWithHeuristic(
        heuristicKeptLocal,
        result.verdict,
      ),
      usage,
    };

    console.log("[AnswerJudge] shadow", {
      verdict: decision.verdict,
      disagreed: decision.disagreedWithHeuristic,
      keptLocal: heuristicKeptLocal,
    });

    return { decision, durationMs };
  } catch (err) {
    console.error("[AnswerJudge] Shadow judge failed:", err);
    return { decision: undefined, durationMs: Math.round(performance.now() - start) };
  }
}
