/**
 * Shared query routing vocabulary.
 *
 * QueryRoute — telemetry / `_route` on every query response.
 * ReplanTool — recovery action chosen by queryReplanGate (uncertain local answer only).
 */

/** Paths that handled a query (observability + API `_route`). */
export const QUERY_ROUTES = {
  CACHE: "cache",
  LOCAL_RAG: "local_rag",
  HYBRID_WEB_FALLBACK: "hybrid_web_fallback",
  WEB_FALLBACK_FAILED: "web_fallback_failed",
  SUGGEST_BREAKDOWN: "suggest_breakdown",
} as const;

export type QueryRoute = (typeof QUERY_ROUTES)[keyof typeof QUERY_ROUTES];

/** Recovery tools for the single-step replan gate. */
export const REPLAN_TOOLS = {
  LOCAL_RAG: "local_rag",
  HYBRID_WEB: "hybrid_web",
  SUGGEST_BREAKDOWN: "suggest_breakdown",
  RETRY_RETRIEVAL: "retry_retrieval",
} as const;

export type ReplanTool = (typeof REPLAN_TOOLS)[keyof typeof REPLAN_TOOLS];

/** Typical route when a replan tool is chosen (execution may still change the outcome). */
export function replanToolDefaultRoute(tool: ReplanTool): QueryRoute {
  switch (tool) {
    case REPLAN_TOOLS.HYBRID_WEB:
      return QUERY_ROUTES.HYBRID_WEB_FALLBACK;
    case REPLAN_TOOLS.SUGGEST_BREAKDOWN:
      return QUERY_ROUTES.SUGGEST_BREAKDOWN;
    case REPLAN_TOOLS.LOCAL_RAG:
    case REPLAN_TOOLS.RETRY_RETRIEVAL:
      return QUERY_ROUTES.LOCAL_RAG;
  }
}
