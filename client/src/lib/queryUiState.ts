export type QueryMode = "core" | "session";

export type ClearQueryOptions = {
  clearQuestion?: boolean;
};

/** Whether switching query mode should reset the query form and last answer. */
export function shouldClearQueryOnModeChange(from: QueryMode, to: QueryMode): boolean {
  return from !== to;
}

export function clearQueryOptionsForModeChange(from: QueryMode, to: QueryMode): ClearQueryOptions | null {
  if (!shouldClearQueryOnModeChange(from, to)) return null;
  return { clearQuestion: true };
}
