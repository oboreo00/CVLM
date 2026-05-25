import type { PrepStatusPayload, PrepStatusResponse } from "@/lib/prepStatusStream";
import { isPrepStatusResponse } from "@/lib/prepStatusStream";

export type PrepDisplayState = {
  prepStatus: PrepStatusResponse;
  starterQuestions: string[];
  chunkIndex: { count: number; sections: string[] } | null;
};

export const INITIAL_PREP_DISPLAY: PrepDisplayState = {
  prepStatus: "none",
  starterQuestions: [],
  chunkIndex: null,
};

/** Maps an SSE prep payload into UI state; returns null when payload is absent. */
export function prepDisplayFromPayload(data: PrepStatusPayload | null): PrepDisplayState | null {
  if (!data) return null;

  const status = data.prepStatus ?? "none";
  return {
    prepStatus: isPrepStatusResponse(status) ? status : "none",
    starterQuestions: data.brief?.starterQuestions ?? [],
    chunkIndex: data.chunkIndex?.count != null ? data.chunkIndex : null,
  };
}

/** Clears mode-specific prep UI until the stream for the new mode delivers a snapshot. */
export function prepDisplayForModeSwitch(): PrepDisplayState {
  return { ...INITIAL_PREP_DISPLAY };
}
