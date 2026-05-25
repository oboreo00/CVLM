export type QueryMode = "core" | "session";

export type ClearQueryOptions = {
  clearQuestion?: boolean;
  /** Reset input highlight animation (mode switch / ingest). */
  clearHighlight?: boolean;
  /** Clear query error banner (mode switch / ingest). */
  clearError?: boolean;
};

/** Whether switching query mode should reset the query form and last answer. */
export function shouldClearQueryOnModeChange(from: QueryMode, to: QueryMode): boolean {
  return from !== to;
}

export function clearQueryOptionsForModeChange(from: QueryMode, to: QueryMode): ClearQueryOptions | null {
  if (!shouldClearQueryOnModeChange(from, to)) return null;
  return { clearQuestion: true, clearHighlight: true, clearError: true };
}

/** Clears prior answer block when starting a new query; keeps highlight animation intact. */
export function clearQueryOptionsForNewQuery(): ClearQueryOptions {
  return {};
}
