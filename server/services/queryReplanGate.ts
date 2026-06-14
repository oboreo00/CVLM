/**
 * Replan gate — single decision tree for query routing after retrieval.
 *
 *   if needsWeb        → hybrid_web
 *   else if lowRelevance → hybrid_web | retry_retrieval (by intent)
 *   else if local failed → hybrid_web | retry_retrieval (by intent)
 *   else               → local_rag
 */

import {
  QUERY_ROUTES,
  REPLAN_TOOLS,
  type QueryRoute,
  type ReplanTool,
} from "@shared/queryRoutes";
import type { QueryIntentLabel } from "./queryIntentClassifier.ts";
import { performance } from "perf_hooks";
import { getAnswer, isContextBoundAnswer, isUncertainAnswer, withGeminiRetries } from "./geminiClient.ts";
import { AI_MODELS } from "./aiConfig.ts";
import {
  formatLocalContext,
  buildLocalRagPrompt,
  performUncertaintyFallback,
} from "./queryAnalyzer.ts";

export type ReplanTrigger =
  | "needs_web_intent"
  | "low_relevance"
  | "uncertain_local_answer";

/** Matches legacy WEB_FALLBACK_SIMILARITY — retrieval quality cutoff. */
export const LOW_RELEVANCE_THRESHOLD = 0.1;

/** Set REPLAN_GATE_ENABLED=false to skip the gate and use legacy hybrid_web fallback. */
export function isReplanGateEnabled(): boolean {
  return process.env.REPLAN_GATE_ENABLED !== "false";
}

export interface ReplanGateInput {
  question: string;
  localAnswer: string;
  relevanceScore: number;
  isAdviceQuestion: boolean;
  isComplex: boolean;
  isSimpleFactualLookup: boolean;
  hasLocalChunks: boolean;
  trigger: ReplanTrigger;
  intentLabel?: QueryIntentLabel;
  intentConfidence?: number;
  intentSource?: "llm" | "heuristic" | "guardrail";
  needsWeb?: boolean;
}

export interface ReplanGateDecision {
  tool: ReplanTool;
  reason: string;
  confidence: number;
  source?: "heuristic" | "intent";
}

export interface ReplanStructure {
  isAdviceQuestion: boolean;
  isComplex: boolean;
  isSimpleFactualLookup: boolean;
  estimatedSubQuestions: number;
}

export interface ReplanExecutionParams {
  ai: any;
  question: string;
  localAnswer: string;
  localResults: any[];
  relevanceScore: number;
  structure: ReplanStructure;
  embeddingCacheHit: boolean;
  queryMode: "core" | "session";
  sessionId?: string;
  decision: ReplanGateDecision;
  rankChunks: (embedding: number[]) => any[];
  embedQuestion: (question: string) => Promise<number[]>;
}

export function isLowRelevance(
  input: Pick<ReplanGateInput, "relevanceScore" | "hasLocalChunks">,
): boolean {
  return !input.hasLocalChunks || input.relevanceScore < LOW_RELEVANCE_THRESHOLD;
}

function preferRetryRetrieval(input: ReplanGateInput): boolean {
  return input.isSimpleFactualLookup || input.intentLabel === "factual_personal";
}

function recoveryByIntent(
  input: ReplanGateInput,
  confidence: number,
  reasonPrefix: string,
): ReplanGateDecision {
  if (input.intentLabel === "off_domain") {
    return {
      tool: REPLAN_TOOLS.HYBRID_WEB,
      reason: `${reasonPrefix}_off_domain`,
      confidence,
      source: "intent",
    };
  }
  if (preferRetryRetrieval(input)) {
    return {
      tool: REPLAN_TOOLS.RETRY_RETRIEVAL,
      reason: `${reasonPrefix}_retry`,
      confidence,
      source: "heuristic",
    };
  }
  return {
    tool: REPLAN_TOOLS.HYBRID_WEB,
    reason: `${reasonPrefix}_hybrid`,
    confidence,
    source: "heuristic",
  };
}

/**
 * Core routing tree. Sync and deterministic — no router LLM.
 */
export function decideReplanTool(input: ReplanGateInput): ReplanGateDecision {
  const confidence = input.intentConfidence ?? 0.85;

  if (input.needsWeb) {
    return {
      tool: REPLAN_TOOLS.HYBRID_WEB,
      reason:
        input.trigger === "needs_web_intent" ? "needs_web_skip_local" : "needs_web",
      confidence,
      source: "intent",
    };
  }

  if (isLowRelevance(input)) {
    return recoveryByIntent(input, confidence, "low_relevance");
  }

  if (
    input.trigger === "uncertain_local_answer" &&
    (isUncertainAnswer(input.localAnswer) || isContextBoundAnswer(input.localAnswer))
  ) {
    return recoveryByIntent(input, confidence, "uncertain_local");
  }

  return {
    tool: REPLAN_TOOLS.LOCAL_RAG,
    reason: "local_sufficient",
    confidence,
    source: "heuristic",
  };
}

function attachReplanMeta(
  body: Record<string, unknown>,
  decision: ReplanGateDecision,
  route: QueryRoute,
): Record<string, unknown> {
  const telemetry = (body.telemetry as Record<string, unknown> | undefined) ?? {};
  return {
    ...body,
    _route: route,
    telemetry: {
      ...telemetry,
      route,
      replanTool: decision.tool,
      replanReason: decision.reason,
      replanConfidence: decision.confidence,
      replanSource: decision.source,
    },
  };
}

async function rephraseForRetrieval(ai: any, question: string): Promise<string> {
  const prompt = `Rephrase this resume question into a shorter semantic search query. Return ONLY the rephrased question, no quotes.

Question: ${question}`;
  try {
    const { text } = await getAnswer(ai, prompt, AI_MODELS.FAST_WORKHORSE);
    const cleaned = text.replace(/["\n]/g, "").trim();
    return cleaned.length > 5 ? cleaned : question;
  } catch {
    return question;
  }
}

/** Runs the chosen replan tool once. Caller merges stepDurations into query telemetry. */
export async function executeReplanTool(
  params: ReplanExecutionParams,
): Promise<{ body: Record<string, unknown>; stepDurations: Record<string, number> }> {
  const stepDurations: Record<string, number> = {};
  const {
    ai,
    question,
    localAnswer,
    localResults,
    relevanceScore,
    structure,
    embeddingCacheHit,
    queryMode,
    sessionId,
    decision,
    rankChunks,
    embedQuestion,
  } = params;

  if (decision.tool === REPLAN_TOOLS.LOCAL_RAG) {
    return {
      body: attachReplanMeta(
        {
          answer: localAnswer,
          sources: localResults.map(
            (r) => (r.content?.substring(0, 80) ?? "") + "...",
          ),
          uncertainty: true,
          isAdviceQuestion: structure.isAdviceQuestion,
        },
        decision,
        QUERY_ROUTES.LOCAL_RAG,
      ),
      stepDurations,
    };
  }

  if (decision.tool === REPLAN_TOOLS.RETRY_RETRIEVAL) {
    const retryStart = performance.now();
    const rephrased = structure.isSimpleFactualLookup
      ? question
      : await rephraseForRetrieval(ai, question);
    const embedding = await embedQuestion(rephrased);
    const retryResults = rankChunks(embedding);
    stepDurations.retryRetrieval = Math.round(performance.now() - retryStart);

    if (retryResults.length > 0) {
      const context = formatLocalContext(retryResults);
      const retryPrompt = buildLocalRagPrompt(context, question);
      const synthStart = performance.now();
      const { text: retryAnswer } = await getAnswer(ai, retryPrompt);
      stepDurations.retrySynthesis = Math.round(performance.now() - synthStart);

      if (!isUncertainAnswer(retryAnswer) && !isContextBoundAnswer(retryAnswer)) {
        return {
          body: attachReplanMeta(
            {
              answer: retryAnswer,
              sources: retryResults.map(
                (r) => (r.content?.substring(0, 80) ?? "") + "...",
              ),
              relevanceScore: Number(relevanceScore.toFixed(4)),
              isAdviceQuestion: structure.isAdviceQuestion,
            },
            decision,
            QUERY_ROUTES.LOCAL_RAG,
          ),
          stepDurations,
        };
      }
    }

    const fallback = await performUncertaintyFallback(
      ai,
      question,
      localResults,
      relevanceScore,
      structure as any,
      embeddingCacheHit,
      queryMode,
      sessionId,
    );
    return {
      body: attachReplanMeta(fallback, decision, QUERY_ROUTES.HYBRID_WEB_FALLBACK),
      stepDurations,
    };
  }

  const fallback = await performUncertaintyFallback(
    ai,
    question,
    localResults,
    relevanceScore,
    structure as any,
    embeddingCacheHit,
    queryMode,
    sessionId,
  );
  return {
    body: attachReplanMeta(fallback, decision, QUERY_ROUTES.HYBRID_WEB_FALLBACK),
    stepDurations,
  };
}
