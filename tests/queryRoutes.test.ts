import { describe, expect, it } from "vitest";
import {
  QUERY_ROUTES,
  REPLAN_TOOLS,
  replanToolDefaultRoute,
} from "@shared/queryRoutes";

describe("queryRoutes", () => {
  it("maps replan tools to default query routes", () => {
    expect(replanToolDefaultRoute(REPLAN_TOOLS.HYBRID_WEB)).toBe(
      QUERY_ROUTES.HYBRID_WEB_FALLBACK,
    );
    expect(replanToolDefaultRoute(REPLAN_TOOLS.SUGGEST_BREAKDOWN)).toBe(
      QUERY_ROUTES.SUGGEST_BREAKDOWN,
    );
    expect(replanToolDefaultRoute(REPLAN_TOOLS.RETRY_RETRIEVAL)).toBe(
      QUERY_ROUTES.LOCAL_RAG,
    );
  });
});
