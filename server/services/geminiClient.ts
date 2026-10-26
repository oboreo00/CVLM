/**
 * Gemini client utilities
 * Retry logic and common patterns for Gemini API interactions
 */

import { AI_MODELS } from "./aiConfig.ts";
import type { GenerateContentResult, LLMAdapter, LLMUsageMetadata } from "./llmAdapter.ts";
import { withLLMRetries } from "./llmRetries.ts";

/** Visible model text; skips Gemini 3 thought parts that often come first in `parts`. */
export function extractGenerateText(response: GenerateContentResult | undefined): string {
  if (!response) return "";
  if (typeof response.text === "string" && response.text.trim()) {
    return response.text;
  }
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("")
    .trim();
}

/**
 * Standard wrapper for Gemini generation with retries and simplified return
 */
export async function getAnswer(
  ai: LLMAdapter,
  prompt: string,
  model: string = AI_MODELS.DEFAULT_ANSWERING_FALLBACKS[0],
): Promise<{ text: string; usage: LLMUsageMetadata | undefined }> {
  const response = await withLLMRetries(`getAnswer (${model})`, () =>
    ai.models.generateContent({
      model: model,
      contents: prompt,
    }),
  );

  const text = extractGenerateText(response);
  
  return { 
    text, 
    usage: response.usageMetadata 
  };
}

/**
 * Checks if an answer indicates uncertainty
 */
export function isUncertainAnswer(answer: string): boolean {
  const lower = answer.toLowerCase().trim();
  return (
    lower.includes("i don't know") ||
    lower.includes("not mentioned") ||
    lower.includes("not in the context") ||
    lower.includes("no information") ||
    lower.includes("i am not sure") ||
    lower.includes("could not find") ||
    lower.length < 20
  );
}

/** Resume-only hedges that refuse to answer forward-looking or advisory questions. */
export function isContextBoundAnswer(answer: string): boolean {
  const lower = answer.toLowerCase().trim();
  return (
    lower.includes("does not state") ||
    lower.includes("do not state") ||
    lower.includes("doesn't state") ||
    lower.includes("not stated") ||
    lower.includes("provided text") ||
    lower.includes("the context does not") ||
    lower.includes("context does not") ||
    lower.includes("cannot determine") ||
    lower.includes("can't determine") ||
    lower.includes("unable to determine") ||
    lower.includes("does not mention") ||
    lower.includes("doesn't mention")
  );
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (magA * magB);
}
