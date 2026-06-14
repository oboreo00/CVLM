/**
 * Query intent classification — LLM-first with heuristic fallback and guardrails.
 *
 * Replaces growing regex ladders for isAdviceQuestion / isSimpleFactualLookup / isComplex.
 * Set QUERY_INTENT_LLM=false to use heuristics only (tests, rollback).
 */

import { withGeminiRetries } from "./geminiClient.ts";
import { AI_MODELS } from "./aiConfig.ts";

export type QueryIntentLabel =
  | "factual_personal"
  | "career_advice"
  | "multi_part"
  | "off_domain";

export type IntentSource = "llm" | "heuristic" | "guardrail";

/** Routing flags consumed by queryAnalyzer, replan gate, and routes. */
export interface QuestionStructure {
  isComplex: boolean;
  isAdviceQuestion: boolean;
  isPersonal: boolean;
  isSimpleFactualLookup: boolean;
  estimatedSubQuestions: number;
  keywords: string[];
  intentLabel?: QueryIntentLabel;
  intentConfidence?: number;
  intentSource?: IntentSource;
  preferLocalRag?: boolean;
  needsWeb?: boolean;
}

const VALID_INTENTS = new Set<QueryIntentLabel>([
  "factual_personal",
  "career_advice",
  "multi_part",
  "off_domain",
]);

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

  return {
    isComplex,
    isAdviceQuestion: isAdviceQuestion && !isSimpleFactualLookup,
    isPersonal,
    isSimpleFactualLookup,
    estimatedSubQuestions: needsBreakdown
      ? Math.max(2, conjunctionCount + questionMarkCount + (isAdviceQuestion ? 1 : 0))
      : 1,
    keywords: words.filter((w) => w.length > 4).slice(0, 5),
    intentLabel: isSimpleFactualLookup
      ? "factual_personal"
      : isAdviceQuestion
        ? "career_advice"
        : isComplex
          ? "multi_part"
          : isPersonal
            ? "factual_personal"
            : "off_domain",
    intentConfidence: 0.5,
    intentSource: "heuristic",
    preferLocalRag: isSimpleFactualLookup,
    needsWeb: !isPersonal && !isSimpleFactualLookup,
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
      estimatedSubQuestions?: number;
      confidence?: number;
    };
    if (!parsed.intent || !VALID_INTENTS.has(parsed.intent as QueryIntentLabel)) {
      return null;
    }
    const label = parsed.intent as QueryIntentLabel;
    return {
      intentLabel: label,
      isSimpleFactualLookup: Boolean(parsed.isSimpleFactualLookup),
      isAdviceQuestion: Boolean(parsed.isAdviceQuestion),
      isComplex: Boolean(parsed.isComplex),
      preferLocalRag: Boolean(parsed.preferLocalRag),
      needsWeb: Boolean(parsed.needsWeb),
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
      intentLabel: "career_advice",
    };
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

  if (next.isAdviceQuestion || next.isComplex) {
    if (next.isSimpleFactualLookup || next.preferLocalRag) guardrailed = true;
    next = { ...next, isSimpleFactualLookup: false, preferLocalRag: false };
  }

  if (next.intentLabel === "off_domain") {
    next = { ...next, needsWeb: true, preferLocalRag: false, isPersonal: false };
  }

  if (guardrailed) {
    next.intentSource = "guardrail";
  }

  return next;
}

function mergeIntent(
  heuristic: QuestionStructure,
  llm: Partial<QuestionStructure>,
): QuestionStructure {
  const label = llm.intentLabel ?? heuristic.intentLabel ?? "factual_personal";
  const isSimpleFactualLookup =
    llm.isSimpleFactualLookup ?? (label === "factual_personal" && !llm.isAdviceQuestion);
  const isAdviceQuestion = llm.isAdviceQuestion ?? label === "career_advice";
  const isComplex = llm.isComplex ?? label === "multi_part";

  return {
    ...heuristic,
    intentLabel: label,
    isSimpleFactualLookup,
    isAdviceQuestion,
    isComplex,
    isPersonal: label !== "off_domain" && (isSimpleFactualLookup || isAdviceQuestion || isComplex || heuristic.isPersonal),
    estimatedSubQuestions:
      llm.estimatedSubQuestions ??
      (isComplex || isAdviceQuestion ? Math.max(2, heuristic.estimatedSubQuestions) : 1),
    preferLocalRag: llm.preferLocalRag ?? isSimpleFactualLookup,
    needsWeb: llm.needsWeb ?? (label === "off_domain" || isAdviceQuestion),
    intentConfidence: llm.intentConfidence ?? 0.7,
    intentSource: "llm",
  };
}

async function classifyQueryIntentWithLlm(
  ai: any,
  question: string,
): Promise<Partial<QuestionStructure> | null> {
  const prompt = `Classify this resume Q&A question. JSON only.

intents:
- factual_personal: about the candidate's own history (jobs, skills, certs, education)
- career_advice: guidance, should I, paths, recommendations
- multi_part: several distinct sub-questions
- off_domain: unrelated to a resume (general trivia, smells, weather)

Q: ${question}

{"intent":"...","isSimpleFactualLookup":bool,"isAdviceQuestion":bool,"isComplex":bool,"preferLocalRag":bool,"needsWeb":bool,"estimatedSubQuestions":1-5,"confidence":0.0-1.0}`;

  try {
    const response = (await withGeminiRetries("classifyQueryIntent", () =>
      ai.models.generateContent({
        model: AI_MODELS.FAST_WORKHORSE,
        contents: prompt,
      }),
    )) as { text?: string; candidates?: { content?: { parts?: { text?: string }[] } }[] };

    const text =
      response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return parseQueryIntentResponse(text);
  } catch (err) {
    console.error("[QueryIntent] LLM classification failed:", err);
    return null;
  }
}

/** Primary entry: LLM intent when enabled, heuristic fallback, then guardrails. */
export async function classifyQueryIntent(
  ai: any,
  question: string,
): Promise<QuestionStructure> {
  const heuristic = heuristicQuestionStructure(question);

  if (!isQueryIntentLlmEnabled()) {
    return applyIntentGuardrails(heuristic, question);
  }

  const llm = await classifyQueryIntentWithLlm(ai, question);
  if (!llm) {
    return applyIntentGuardrails(heuristic, question);
  }

  const merged = mergeIntent(heuristic, llm);
  const guarded = applyIntentGuardrails(merged, question);
  console.log("[QueryIntent]", guarded.intentLabel, guarded.intentSource, {
    factual: guarded.isSimpleFactualLookup,
    advice: guarded.isAdviceQuestion,
    complex: guarded.isComplex,
  });
  return guarded;
}
