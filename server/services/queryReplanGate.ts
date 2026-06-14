/**
 * Single-step replan gate for uncertain local RAG answers.
 *
 * Heuristics + upstream LLM intent pick a recovery tool without a second router LLM in most cases.
 * chooseReplanTool runs only in the relevance gray zone when intent is uncertain.
 */

import {
  QUERY_ROUTES,
  REPLAN_TOOLS,
  type QueryRoute,
  type ReplanTool,
} from "@shared/queryRoutes";
import type { QueryIntentLabel } from "./queryIntentClassifier.ts";
import { performance } from "perf_hooks";
import { getAnswer, isUncertainAnswer, withGeminiRetries } from "./geminiClient.ts";
import { AI_MODELS } from "./aiConfig.ts";
import {
  formatLocalContext,
  buildLocalRagPrompt,
  performUncertaintyFallback,
  suggestQuestionBreakdown,
} from "./queryAnalyzer.ts";

export type ReplanTrigger = "uncertain_local_answer" | "borderline_relevance";

/** Set REPLAN_GATE_ENABLED=false to skip the gate and use legacy hybrid_web fallback. */
export function isReplanGateEnabled(): boolean {
  return process.env.REPLAN_GATE_ENABLED !== "false";
}

/** Gray zone above WEB_FALLBACK_SIMILARITY (0.1) where routing is ambiguous. */
export const REPLAN_BORDERLINE_RELEVANCE = { min: 0.1, max: 0.35 } as const;

/** Min confidence from classifyQueryIntent (LLM) to drive replan tool directly. */
export const INTENT_REPLAN_CONFIDENCE = 0.75;

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
}

export interface ReplanGateDecision {
  tool: ReplanTool;
  reason: string;
  confidence: number;
  source?: "heuristic" | "llm" | "guardrail" | "intent";
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

const VALID_TOOLS = new Set<ReplanTool>(Object.values(REPLAN_TOOLS));

const DEFAULT_DECISION: ReplanGateDecision = {
  tool: REPLAN_TOOLS.HYBRID_WEB,
  reason: "default_hybrid_fallback",
  confidence: 0,
  source: "heuristic",
};

/**
 * Deterministic routing — skips the router LLM when intent/relevance is clear.
 * Returns null only in the gray zone (needs chooseReplanTool).
 */
export function resolveReplanHeuristic(input: ReplanGateInput): ReplanGateDecision | null {
  if (!input.hasLocalChunks) {
    return {
      tool: REPLAN_TOOLS.HYBRID_WEB,
      reason: "no_local_chunks",
      confidence: 1,
      source: "heuristic",
    };
  }

  if (input.isSimpleFactualLookup) {
    return {
      tool: REPLAN_TOOLS.RETRY_RETRIEVAL,
      reason: "simple_factual",
      confidence: 0.95,
      source: "heuristic",
    };
  }

  if (input.isAdviceQuestion || input.isComplex) {
    if (input.relevanceScore < REPLAN_BORDERLINE_RELEVANCE.min) {
      return {
        tool: REPLAN_TOOLS.HYBRID_WEB,
        reason: "advice_low_relevance",
        confidence: 0.9,
        source: "heuristic",
      };
    }
    return {
      tool: REPLAN_TOOLS.SUGGEST_BREAKDOWN,
      reason: "advice_or_complex",
      confidence: 0.85,
      source: "heuristic",
    };
  }

  if (input.relevanceScore < REPLAN_BORDERLINE_RELEVANCE.min) {
    return {
      tool: REPLAN_TOOLS.HYBRID_WEB,
      reason: "low_relevance",
      confidence: 0.85,
      source: "heuristic",
    };
  }

  if (input.relevanceScore >= REPLAN_BORDERLINE_RELEVANCE.max) {
    return {
      tool: REPLAN_TOOLS.RETRY_RETRIEVAL,
      reason: "decent_relevance_retry",
      confidence: 0.8,
      source: "heuristic",
    };
  }

  return null;
}

/**
 * Maps high-confidence upstream intent (classifyQueryIntent) to a replan tool.
 * Skips chooseReplanTool when the query was already understood at the start.
 */
export function replanToolFromIntent(input: ReplanGateInput): ReplanGateDecision | null {
  if (input.intentSource !== "llm") return null;
  if ((input.intentConfidence ?? 0) < INTENT_REPLAN_CONFIDENCE) return null;
  if (!input.intentLabel) return null;

  if (!input.hasLocalChunks) {
    return {
      tool: REPLAN_TOOLS.HYBRID_WEB,
      reason: "intent_no_local_chunks",
      confidence: input.intentConfidence ?? 0.8,
      source: "intent",
    };
  }

  const lowRelevance = input.relevanceScore < REPLAN_BORDERLINE_RELEVANCE.min;

  switch (input.intentLabel) {
    case "factual_personal":
      return {
        tool: lowRelevance ? REPLAN_TOOLS.HYBRID_WEB : REPLAN_TOOLS.RETRY_RETRIEVAL,
        reason: lowRelevance ? "intent_factual_low_relevance" : "intent_factual_personal",
        confidence: input.intentConfidence ?? 0.8,
        source: "intent",
      };
    case "career_advice":
      return {
        tool: lowRelevance ? REPLAN_TOOLS.HYBRID_WEB : REPLAN_TOOLS.SUGGEST_BREAKDOWN,
        reason: lowRelevance ? "intent_advice_low_relevance" : "intent_career_advice",
        confidence: input.intentConfidence ?? 0.8,
        source: "intent",
      };
    case "multi_part":
      return {
        tool: REPLAN_TOOLS.SUGGEST_BREAKDOWN,
        reason: "intent_multi_part",
        confidence: input.intentConfidence ?? 0.8,
        source: "intent",
      };
    case "off_domain":
      return {
        tool: REPLAN_TOOLS.HYBRID_WEB,
        reason: "intent_off_domain",
        confidence: input.intentConfidence ?? 0.8,
        source: "intent",
      };
    default:
      return null;
  }
}

/** Clamp LLM/heuristic choices that waste tokens or violate intent. */
export function applyReplanGuardrails(
  decision: ReplanGateDecision,
  input: ReplanGateInput,
): ReplanGateDecision {
  let tool = decision.tool;
  let reason = decision.reason;

  if (input.isAdviceQuestion || input.isComplex) {
    if (tool === REPLAN_TOOLS.LOCAL_RAG || tool === REPLAN_TOOLS.RETRY_RETRIEVAL) {
      tool =
        input.relevanceScore < REPLAN_BORDERLINE_RELEVANCE.min
          ? REPLAN_TOOLS.HYBRID_WEB
          : REPLAN_TOOLS.SUGGEST_BREAKDOWN;
      reason = `guardrail_${decision.tool}_to_${tool}`;
    }
  }

  if (input.isSimpleFactualLookup && tool !== REPLAN_TOOLS.RETRY_RETRIEVAL) {
    tool = REPLAN_TOOLS.RETRY_RETRIEVAL;
    reason = `guardrail_${decision.tool}_to_retry_retrieval`;
  }

  if (!input.hasLocalChunks && (tool === REPLAN_TOOLS.LOCAL_RAG || tool === REPLAN_TOOLS.RETRY_RETRIEVAL)) {
    tool = REPLAN_TOOLS.HYBRID_WEB;
    reason = `guardrail_${decision.tool}_no_chunks`;
  }

  if (
    input.relevanceScore < REPLAN_BORDERLINE_RELEVANCE.min &&
    (tool === REPLAN_TOOLS.LOCAL_RAG || tool === REPLAN_TOOLS.RETRY_RETRIEVAL)
  ) {
    tool = REPLAN_TOOLS.HYBRID_WEB;
    reason = `guardrail_${decision.tool}_low_relevance`;
  }

  if (tool === decision.tool) return decision;
  return { tool, reason, confidence: decision.confidence, source: "guardrail" };
}

export async function decideReplanTool(
  ai: any,
  input: ReplanGateInput,
): Promise<ReplanGateDecision> {
  const fromIntent = replanToolFromIntent(input);
  if (fromIntent) {
    const guarded = applyReplanGuardrails(fromIntent, input);
    console.log("[ReplanGate] intent", guarded);
    return guarded;
  }

  const heuristic = resolveReplanHeuristic(input);
  if (heuristic) {
    const guarded = applyReplanGuardrails(heuristic, input);
    console.log("[ReplanGate] heuristic", guarded);
    return guarded;
  }

  const llm = await chooseReplanTool(ai, input);
  const guarded = applyReplanGuardrails({ ...llm, source: "llm" }, input);
  console.log("[ReplanGate] llm", guarded);
  return guarded;
}

export function shouldInvokeReplanGate(input: ReplanGateInput): boolean {
  if (!isReplanGateEnabled()) return false;

  if (input.trigger === "uncertain_local_answer") return true;

  if (input.trigger === "borderline_relevance") {
    return (
      input.relevanceScore >= REPLAN_BORDERLINE_RELEVANCE.min &&
      input.relevanceScore < REPLAN_BORDERLINE_RELEVANCE.max &&
      !input.isSimpleFactualLookup &&
      input.hasLocalChunks
    );
  }

  return false;
}

export function parseReplanToolResponse(text: string): ReplanGateDecision | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as {
      tool?: string;
      reason?: string;
      confidence?: number;
    };
    if (!parsed.tool || !VALID_TOOLS.has(parsed.tool as ReplanTool)) return null;
    return {
      tool: parsed.tool as ReplanTool,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 240) : "model_choice",
      confidence:
        typeof parsed.confidence === "number"
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.5,
    };
  } catch {
    return null;
  }
}

export async function chooseReplanTool(
  ai: any,
  input: ReplanGateInput,
): Promise<ReplanGateDecision> {
  const prompt = `Pick ONE recovery tool for an uncertain resume RAG answer. Gray-zone only.

Tools: ${Object.values(REPLAN_TOOLS).join(" | ")}
relevance=${input.relevanceScore.toFixed(2)} advice=${input.isAdviceQuestion} complex=${input.isComplex} factual=${input.isSimpleFactualLookup}
Q: ${input.question}

JSON only: {"tool":"...","reason":"...","confidence":0.0-1.0}`;

  try {
    const response = (await withGeminiRetries("replanGate", () =>
      ai.models.generateContent({
        model: AI_MODELS.FAST_WORKHORSE,
        contents: prompt,
      }),
    )) as { text?: string; candidates?: { content?: { parts?: { text?: string }[] } }[] };

    const text =
      response.text ||
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      "";
    const decision = parseReplanToolResponse(text);
    if (decision) {
      console.log("[ReplanGate] chose tool", decision);
      return decision;
    }
  } catch (err) {
    console.error("[ReplanGate] tool choice failed:", err);
  }

  return DEFAULT_DECISION;
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

/**
 * Runs the chosen replan tool once. Caller merges stepDurations into query telemetry.
 */
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

  if (decision.tool === REPLAN_TOOLS.SUGGEST_BREAKDOWN) {
    if (structure.estimatedSubQuestions <= 1) {
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

    const start = performance.now();
    const breakdown = await suggestQuestionBreakdown(ai, question, structure as any);
    stepDurations.breakdown = Math.round(performance.now() - start);

    return {
      body: attachReplanMeta(
        {
          answer: localAnswer,
          sources: [],
          uncertainty: true,
          isAdviceQuestion: structure.isAdviceQuestion,
          suggestedQuestions:
            breakdown.questions.length > 0 ? breakdown.questions : undefined,
          hint:
            breakdown.questions.length > 0
              ? structure.isAdviceQuestion
                ? "This looks like a career-guidance question. Try these focused angles:"
                : "Try these simpler questions instead:"
              : undefined,
        },
        decision,
        QUERY_ROUTES.SUGGEST_BREAKDOWN,
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

      if (!isUncertainAnswer(retryAnswer)) {
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

    if (structure.isAdviceQuestion || structure.isComplex || structure.isSimpleFactualLookup) {
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
