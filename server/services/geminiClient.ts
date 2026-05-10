/**
 * Gemini client utilities
 * Retry logic and common patterns for Gemini API interactions
 */

import { AI_MODELS } from "./aiConfig.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Standard wrapper for Gemini generation with retries and simplified return
 */
export async function getAnswer(ai: any, prompt: string, model: string = AI_MODELS.DEFAULT_ANSWERING_FALLBACKS[0]): Promise<{ text: string, usage: any }> {
  const response = (await withGeminiRetries(`getAnswer (${model})`, () =>
    ai.models.generateContent({
      model: model,
      contents: prompt,
    }),
  )) as any;

  // The SDK class instance has a .text getter, but for the raw response 
  // we access candidates[0]
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
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

function isRetriableGeminiError(err: unknown): boolean {
  const e = err as {
    status?: number;
    code?: number;
    message?: string;
    error?: { code?: number; status?: string };
  };
  const status = e?.status ?? e?.code ?? e?.error?.code;
  const msg = String(e?.message ?? err ?? "");

  // If it's a 429 but specifically a "Daily Quota" limit, do NOT retry.
  // We've run out of gas for the day.
  if (msg.includes("GenerateRequestsPerDay") || msg.includes("quota exceeded")) {
    return false; 
  }

  if (status === 503 || status === 429) return true;
  if (/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|temporarily unavailable/i.test(msg))
    return true;
  return false;
}

export async function withGeminiRetries<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  let last: unknown;
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt < maxAttempts && isRetriableGeminiError(err)) {
        const delayMs = 250 * 2 ** (attempt - 1);
        console.warn(
          `[RAG] ${label} attempt ${attempt}/${maxAttempts} failed; retry in ${delayMs}ms`,
        );
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw last;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (magA * magB);
}
