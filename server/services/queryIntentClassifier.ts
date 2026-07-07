/**
 * Query intent classification — LLM-first with heuristic fallback and guardrails.
 *
 * Replaces growing regex ladders for isAdviceQuestion / isSimpleFactualLookup / isComplex.
 * Set QUERY_INTENT_LLM=false to use heuristics only (tests, rollback).
 */

import {
  INTENT_LABELS,
  RECOVERY_HINTS,
  isIntentLabel,
  isRecoveryHint,
  type IntentLabel,
  type RecoveryHint,
} from "@shared/queryIntent";
import { withLLMRetries } from "./llmRetries.ts";
import { AI_MODELS } from "./aiConfig.ts";
import type { LLMAdapter, LLMUsageMetadata } from "./llmAdapter.ts";

export type { IntentLabel, RecoveryHint } from "@shared/queryIntent";

export type IntentSource = "llm" | "heuristic" | "guardrail";

/** Routing flags consumed by queryAnalyzer, replan gate, and routes. */
export interface QuestionStructure {
  isComplex: boolean;
  isAdviceQuestion: boolean;
  isPersonal: boolean;
  isSimpleFactualLookup: boolean;
  estimatedSubQuestions: number;
  keywords: string[];
  intentLabel?: IntentLabel;
  intentConfidence?: number;
  intentSource?: IntentSource;
  preferLocalRag?: boolean;
  needsWeb?: boolean;
  recoveryHint?: RecoveryHint;
  /** Set when QUERY_INTENT_LLM classifies; used for step_durations.tokens.intent telemetry. */
  intentClassifierUsage?: LLMUsageMetadata;
}

export function deriveRecoveryHint(input: {
  intentLabel?: IntentLabel;
  needsWeb?: boolean;
  isSimpleFactualLookup?: boolean;
  isAdviceQuestion?: boolean;
}): RecoveryHint {
  if (input.needsWeb || input.intentLabel === INTENT_LABELS.OFF_DOMAIN) {
    return RECOVERY_HINTS.HYBRID_WEB;
  }
  if (input.isSimpleFactualLookup || input.intentLabel === INTENT_LABELS.FACTUAL_PERSONAL) {
    return RECOVERY_HINTS.RETRY_RETRIEVAL;
  }
  if (input.isAdviceQuestion || input.intentLabel === INTENT_LABELS.CAREER_ADVICE) {
    return RECOVERY_HINTS.HYBRID_WEB;
  }
  return RECOVERY_HINTS.HYBRID_WEB;
}

function parseRecoveryHint(value: unknown): RecoveryHint | undefined {
  if (typeof value !== "string" || !isRecoveryHint(value)) return undefined;
  return value;
}

function clampRecoveryHint(structure: QuestionStructure): QuestionStructure {
  const derived = deriveRecoveryHint(structure);
  let recoveryHint = structure.recoveryHint ?? derived;

  if (structure.needsWeb) recoveryHint = RECOVERY_HINTS.HYBRID_WEB;
  else if (structure.isSimpleFactualLookup && recoveryHint === RECOVERY_HINTS.HYBRID_WEB) {
    recoveryHint = RECOVERY_HINTS.RETRY_RETRIEVAL;
  } else if (structure.intentLabel === INTENT_LABELS.OFF_DOMAIN) {
    recoveryHint = RECOVERY_HINTS.HYBRID_WEB;
  }

  if (recoveryHint === structure.recoveryHint) return structure;
  return { ...structure, recoveryHint };
}

function resolveHeuristicIntentLabel(input: {
  isSimpleFactualLookup: boolean;
  isAdviceQuestion: boolean;
  isComplex: boolean;
  isPersonal: boolean;
}): IntentLabel {
  if (input.isSimpleFactualLookup) return INTENT_LABELS.FACTUAL_PERSONAL;
  if (input.isAdviceQuestion) return INTENT_LABELS.CAREER_ADVICE;
  if (input.isComplex) return INTENT_LABELS.MULTI_PART;
  if (input.isPersonal) return INTENT_LABELS.FACTUAL_PERSONAL;
  return INTENT_LABELS.OFF_DOMAIN;
}

export function isQueryIntentLlmEnabled(): boolean {
  return process.env.QUERY_INTENT_LLM !== "false";
}

/** Fast regex baseline — fallback when LLM is off or parse fails. */
export function heuristicQuestionStructure(question: string): QuestionStructure {
  const words = question.toLowerCase().split(/\s+/);
  const conjunctions = ["and", "but", "or", "however", "also", "additionally"];
  const questionMarkCount = (question.match(/\?/g) || []).length;
  const conjunctionCount = conjunctions.filter((conj) =>
    question.toLowerCase().includes(` ${conj} `),
  ).length;

  const advicePattern =
    /should i|should i get|would i|could i|which path|what career|what should|what would|choose|decision|recommend|guidanc|advic|pros|cons|worth it|better to/i;
  const isAdviceQuestion = advicePattern.test(question);

  const isPersonal =
    isAdviceQuestion ||
    /company|career|skill|experience|work|job|resum[ee]|what.*i|what.*am.*i|my |did i|have i|certif|credential|education|degree/i.test(
      question,
    );

  const isComplex =
    questionMarkCount > 1 || words.length > 25 || conjunctionCount > 1;

  const isDirectPersonal =
    /skill|experience|background|history|role|title|education|project|achieve|done|did|got|have|certif|credential|degree/i.test(
      question,
    ) && /i |me|my|did i|have i/i.test(question);

  const isSimpleFactualLookup =
    isDirectPersonal &&
    !isAdviceQuestion &&
    (isComplex === false || questionMarkCount <= 1);

  const needsBreakdown = isComplex || isAdviceQuestion;
  const intentLabel = resolveHeuristicIntentLabel({
    isSimpleFactualLookup,
    isAdviceQuestion,
    isComplex,
    isPersonal,
  });

  return {
    isComplex,
    isAdviceQuestion: isAdviceQuestion && !isSimpleFactualLookup,
    isPersonal,
    isSimpleFactualLookup,
    estimatedSubQuestions: needsBreakdown
      ? Math.max(2, conjunctionCount + questionMarkCount + (isAdviceQuestion ? 1 : 0))
      : 1,
    keywords: words.filter((w) => w.length > 4).slice(0, 5),
    intentLabel,
    intentConfidence: 0.5,
    intentSource: "heuristic",
    preferLocalRag: isSimpleFactualLookup,
    needsWeb: !isPersonal && !isSimpleFactualLookup,
    recoveryHint: deriveRecoveryHint({
      intentLabel,
      needsWeb: !isPersonal && !isSimpleFactualLookup,
      isSimpleFactualLookup,
      isAdviceQuestion: isAdviceQuestion && !isSimpleFactualLookup,
    }),
  };
}

export function parseQueryIntentResponse(text: string): Partial<QuestionStructure> | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as {
      intent?: string;
      isSimpleFactualLookup?: boolean;
      isAdviceQuestion?: boolean;
      isComplex?: boolean;
      preferLocalRag?: boolean;
      needsWeb?: boolean;
      recoveryHint?: string;
      estimatedSubQuestions?: number;
      confidence?: number;
    };
    if (!parsed.intent || !isIntentLabel(parsed.intent)) return null;
    const label = parsed.intent;
    return {
      intentLabel: label,
      isSimpleFactualLookup: Boolean(parsed.isSimpleFactualLookup),
      isAdviceQuestion: Boolean(parsed.isAdviceQuestion),
      isComplex: Boolean(parsed.isComplex),
      preferLocalRag: Boolean(parsed.preferLocalRag),
      needsWeb: Boolean(parsed.needsWeb),
      recoveryHint: parseRecoveryHint(parsed.recoveryHint),
      estimatedSubQuestions:
        typeof parsed.estimatedSubQuestions === "number"
          ? Math.max(1, Math.min(5, Math.round(parsed.estimatedSubQuestions)))
          : undefined,
      intentConfidence:
        typeof parsed.confidence === "number"
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.7,
    };
  } catch {
    return null;
  }
}

/** Clamp obvious LLM/heuristic mistakes without rebuilding the regex ladder. */
export function applyIntentGuardrails(
  structure: QuestionStructure,
  question: string,
): QuestionStructure {
  let next = { ...structure };
  let guardrailed = false;

  const asksForAdvice =
    /should i|should i get|would i|could i|worth it|better to|recommend|which path|what career/i.test(
      question,
    );
  if (asksForAdvice && next.isSimpleFactualLookup) {
    guardrailed = true;
    next = {
      ...next,
      isSimpleFactualLookup: false,
      isAdviceQuestion: true,
      preferLocalRag: false,
      needsWeb: true,
      intentLabel: INTENT_LABELS.CAREER_ADVICE,
    };
  }

  // Advice/complex before simple-factual normalization so contradictory LLM flags keep advice.
  if (next.isAdviceQuestion || next.isComplex) {
    if (next.isSimpleFactualLookup || next.preferLocalRag) guardrailed = true;
    next = { ...next, isSimpleFactualLookup: false, preferLocalRag: false };
  }

  if (next.isSimpleFactualLookup) {
    if (!next.preferLocalRag || next.isAdviceQuestion) guardrailed = true;
    next = {
      ...next,
      isAdviceQuestion: false,
      preferLocalRag: true,
      needsWeb: false,
    };
  }

  if (next.intentLabel === INTENT_LABELS.OFF_DOMAIN) {
    next = { ...next, needsWeb: true, preferLocalRag: false, isPersonal: false };
  }

  if (guardrailed) {
    next.intentSource = "guardrail";
  }

  return clampRecoveryHint(next);
}

function mergeIntent(
  heuristic: QuestionStructure,
  llm: Partial<QuestionStructure>,
): QuestionStructure {
  const label = llm.intentLabel ?? heuristic.intentLabel ?? INTENT_LABELS.FACTUAL_PERSONAL;
  const isSimpleFactualLookup =
    llm.isSimpleFactualLookup ?? (label === INTENT_LABELS.FACTUAL_PERSONAL && !llm.isAdviceQuestion);
  const isAdviceQuestion = llm.isAdviceQuestion ?? label === INTENT_LABELS.CAREER_ADVICE;
  const isComplex = llm.isComplex ?? label === INTENT_LABELS.MULTI_PART;

  return {
    ...heuristic,
    intentLabel: label,
    isSimpleFactualLookup,
    isAdviceQuestion,
    isComplex,
    isPersonal:
      label !== INTENT_LABELS.OFF_DOMAIN &&
      (isSimpleFactualLookup || isAdviceQuestion || isComplex || heuristic.isPersonal),
    estimatedSubQuestions:
      llm.estimatedSubQuestions ??
      (isComplex || isAdviceQuestion ? Math.max(2, heuristic.estimatedSubQuestions) : 1),
    preferLocalRag: llm.preferLocalRag ?? isSimpleFactualLookup,
    needsWeb: llm.needsWeb ?? (label === INTENT_LABELS.OFF_DOMAIN || isAdviceQuestion),
    recoveryHint:
      llm.recoveryHint ??
      deriveRecoveryHint({
        intentLabel: label,
        needsWeb: llm.needsWeb ?? (label === INTENT_LABELS.OFF_DOMAIN || isAdviceQuestion),
        isSimpleFactualLookup,
        isAdviceQuestion,
      }),
    intentConfidence: llm.intentConfidence ?? 0.7,
    intentSource: "llm",
  };
}

async function classifyQueryIntentWithLlm(
  ai: LLMAdapter,
  question: string,
): Promise<{ partial: Partial<QuestionStructure> | null; usage?: LLMUsageMetadata }> {
  const recoveryHintValues = Object.values(RECOVERY_HINTS).join(" | ");
  const prompt = `Classify this resume Q&A question. JSON only.

intents:
- ${INTENT_LABELS.FACTUAL_PERSONAL}: about the candidate's own history (jobs, skills, certs, education)
- ${INTENT_LABELS.CAREER_ADVICE}: guidance, should I, paths, recommendations
- ${INTENT_LABELS.MULTI_PART}: several distinct sub-questions
- ${INTENT_LABELS.OFF_DOMAIN}: unrelated to a resume (general trivia, smells, weather)

recoveryHint values: ${recoveryHintValues} (suggested recovery if local RAG is insufficient)

Q: ${question}

{"intent":"...","isSimpleFactualLookup":bool,"isAdviceQuestion":bool,"isComplex":bool,"preferLocalRag":bool,"needsWeb":bool,"recoveryHint":"${recoveryHintValues}","estimatedSubQuestions":1-5,"confidence":0.0-1.0}`;

  try {
    const response = (await withLLMRetries("classifyQueryIntent", () =>
      ai.models.generateContent({
        model: AI_MODELS.FAST_WORKHORSE,
        contents: prompt,
      }),
    ));

    const text =
      response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return {
      partial: parseQueryIntentResponse(text),
      usage: response.usageMetadata,
    };
  } catch (err) {
    console.error("[QueryIntent] LLM classification failed:", err);
    return { partial: null };
  }
}

/** Primary entry: LLM intent when enabled, heuristic fallback, then guardrails. */
export async function classifyQueryIntent(
  ai: LLMAdapter,
  question: string,
): Promise<QuestionStructure> {
  const heuristic = heuristicQuestionStructure(question);

  if (!isQueryIntentLlmEnabled()) {
    return applyIntentGuardrails(heuristic, question);
  }

  const { partial: llm, usage: intentClassifierUsage } = await classifyQueryIntentWithLlm(ai, question);
  if (!llm) {
    return applyIntentGuardrails(heuristic, question);
  }

  const merged = mergeIntent(heuristic, llm);
  const guarded = applyIntentGuardrails(merged, question);
  const withUsage: QuestionStructure = {
    ...guarded,
    ...(intentClassifierUsage ? { intentClassifierUsage } : {}),
  };
  console.log("[QueryIntent]", withUsage.intentLabel, withUsage.intentSource, {
    factual: withUsage.isSimpleFactualLookup,
    advice: withUsage.isAdviceQuestion,
    complex: withUsage.isComplex,
    recoveryHint: withUsage.recoveryHint,
  });
  return withUsage;
}
