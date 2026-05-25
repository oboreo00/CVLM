import { z } from "zod";
import { ingestSchema, querySchema, documents } from "./schema";

const RAG_BASE = "/api/rag";
export const api = {
  rag: {
    ingest: {
      method: "POST" as const,
      path: `${RAG_BASE}/ingest`,
      input: ingestSchema,
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
        500: z.object({ message: z.string() }),
      },
    },
    query: {
      method: "POST" as const,
      path: `${RAG_BASE}/query`,
      input: querySchema,
      responses: {
        200: z.object({
          answer: z.string(),
          sources: z.array(z.string()),
          relevanceScore: z.number().optional(),
          isAdviceQuestion: z.boolean().optional(),
          _cacheHit: z.boolean().optional(),
          telemetry: z.object({
            totalDurationMs: z.number(),
            stepDurations: z.record(z.string(), z.number()),
            relevanceScore: z.number(),
            modelsUsed: z.object({
              synthesis: z.string(),
              analysis: z.string(),
              embedding: z.string(),
            }),
            cacheStatus: z.object({
              embeddingHit: z.boolean(),
              webSearchHit: z.boolean(),
              responseHit: z.boolean(),
            }),
            promptTokens: z.number().optional(),
            completionTokens: z.number().optional(),
            totalTokens: z.number().optional(),
          }).optional(),
        }),
        500: z.object({ message: z.string() }),
      },
    },
    sessionStatus: {
      method: "GET" as const,
      path: `${RAG_BASE}/session-status`,
      responses: {
        200: z.object({
          hasDocument: z.boolean(),
          prepStatus: z.enum(["none", "pending", "ready", "failed"]).optional(),
        }),
        500: z.object({ message: z.string() }),
      },
    },
    prepStatus: {
      method: "GET" as const,
      path: `${RAG_BASE}/prep-status`,
      responses: {
        200: z.object({
          prepStatus: z.enum(["none", "pending", "ready", "failed"]),
          profile: z.record(z.string(), z.any()).optional(),
          brief: z
            .object({
              summary: z.string(),
              proofPoints: z.array(z.string()),
              starterQuestions: z.array(z.string()),
            })
            .optional(),
          prepError: z.string().optional(),
          chunkIndex: z
            .object({
              count: z.number(),
              sections: z.array(z.string()),
            })
            .optional(),
        }),
        500: z.object({ message: z.string() }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
