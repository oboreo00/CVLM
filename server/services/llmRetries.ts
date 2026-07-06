/**
 * Provider-agnostic retry wrapper for LLM adapter calls (rate limits, transient outages).
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableLlmError(err: unknown): boolean {
  const e = err as {
    status?: number;
    code?: number;
    message?: string;
    error?: { code?: number; status?: string };
  };
  const status = e?.status ?? e?.code ?? e?.error?.code;
  const msg = String(e?.message ?? err ?? "");

  // Daily quota exhaustion — retrying won't help until reset.
  if (msg.includes("GenerateRequestsPerDay") || msg.includes("quota exceeded")) {
    return false;
  }

  if (status === 503 || status === 429) return true;
  if (/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|temporarily unavailable/i.test(msg)) {
    return true;
  }
  return false;
}

export async function withLLMRetries<T>(
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
      if (attempt < maxAttempts && isRetriableLlmError(err)) {
        const delayMs = 250 * 2 ** (attempt - 1);
        console.warn(
          `[LLM] ${label} attempt ${attempt}/${maxAttempts} failed; retry in ${delayMs}ms`,
        );
        await sleep(delayMs);
        continue;
      }
      throw err;
    }
  }
  throw last;
}
