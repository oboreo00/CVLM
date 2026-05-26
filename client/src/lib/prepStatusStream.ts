import { extractPrepPayloadsFromSseBuffer } from "@/lib/parsePrepSse";
import { supabase } from "@/lib/supabase";

export const PREP_STATUS_VALUES = ["none", "pending", "ready", "failed"] as const;

export type PrepStatusResponse = (typeof PREP_STATUS_VALUES)[number];

export function isPrepStatusResponse(value: string): value is PrepStatusResponse {
  return (PREP_STATUS_VALUES as readonly string[]).includes(value);
}

export interface PrepStatusPayload {
  prepStatus: PrepStatusResponse;
  brief?: { summary?: string; starterQuestions?: string[] };
  chunkIndex?: { count: number; sections: string[] };
  prepError?: string;
}

/** True when the client should open the prep SSE stream (not already terminal with starters). */
export function shouldConnectPrepStatusStream(snapshot: PrepStatusPayload | null): boolean {
  if (!snapshot) return true;
  if (snapshot.prepStatus === "pending" || snapshot.prepStatus === "none") return true;
  if (snapshot.prepStatus === "failed") return false;
  if (snapshot.prepStatus === "ready") {
    return (snapshot.brief?.starterQuestions?.length ?? 0) === 0;
  }
  return true;
}

async function authHeadersForPrep(queryMode: "core" | "session"): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    if (queryMode === "session") {
      throw new Error("Authentication required for session prep status");
    }
    return {};
  }
  return { Authorization: `Bearer ${session.access_token}` };
}

/** One-shot prep snapshot (core works without login; session requires JWT). */
export async function fetchPrepStatusSnapshot(
  queryMode: "core" | "session",
  signal?: AbortSignal,
): Promise<PrepStatusPayload | null> {
  try {
    const headers = await authHeadersForPrep(queryMode);
    const res = await fetch(`/api/rag/prep-status?queryMode=${queryMode}`, {
      headers,
      signal,
    });
    if (!res.ok) {
      console.error("Prep status fetch failed:", res.status);
      return null;
    }
    return (await res.json()) as PrepStatusPayload;
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      console.error("Prep status fetch error", err);
    }
    return null;
  }
}

/**
 * SSE over fetch (supports Authorization header for session).
 * Core prep is public; session requires auth. Calls onPayload for each event.
 */
export async function consumePrepStatusStream(
  queryMode: "core" | "session",
  onPayload: (data: PrepStatusPayload) => void,
  signal: AbortSignal,
): Promise<void> {
  const headers = await authHeadersForPrep(queryMode);

  const res = await fetch(`/api/rag/prep/stream?queryMode=${queryMode}`, {
    headers,
    signal,
  });

  if (!res.ok || !res.body) {
    console.error("Prep status stream failed:", res.status);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const { payloads, remaining } = extractPrepPayloadsFromSseBuffer(buffer);
      buffer = remaining;
      for (const payload of payloads) {
        if (signal.aborted) return;
        onPayload(payload as PrepStatusPayload);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
