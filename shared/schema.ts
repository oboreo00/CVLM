import { pgTable, text, serial, jsonb, vector, integer, numeric, timestamp, uuid, pgPolicy, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { createHash } from "crypto";
import { sql } from "drizzle-orm";

/**
 * Hashes the content of a document using MD5.
 * @param text - The text to hash.
 * @returns The MD5 hash of the text.
 */
export function hashContent(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

/**
 * Database table for storing document content, metadata, and high-dimensional vector embeddings.
 * @note Add IVFFlat/HNSW index at >1000 rows. Note: Local JSON cache handles high-frequency repeats, but DB indexing is required for O(log N) search on unique/cold queries.
 */
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  embedding: vector("embedding", { dimensions: 3072 }),
  userId: uuid("user_id"),
}, (t) => [
  pgPolicy("Users can view own or global documents", {
    for: "select",
    to: ["authenticated", "anon"],
    using: sql`auth.uid() = user_id OR user_id IS NULL`,
  }),
  pgPolicy("Users can insert own documents", {
    for: "insert",
    to: ["authenticated", "anon"],
    withCheck: sql`auth.uid() = user_id`,
  }),
  pgPolicy("Users can delete own documents", {
    for: "delete",
    to: ["authenticated", "anon"],
    using: sql`auth.uid() = user_id`,
  }),
]);

export const queryLogs = pgTable("query_logs", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  queryMode: text("query_mode").notNull(),
  totalDurationMs: integer("total_duration_ms").notNull(),
  relevanceScore: numeric("relevance_score"),
  modelsUsed: jsonb("models_used"), // {synthesis: string, analysis: string, embedding: string}
  stepDurations: jsonb("step_durations"), // {embedding: ms, analysis: ms, ...}
  cacheStatus: jsonb("cache_status"), // {embeddingHit: bool, webSearchHit: bool, responseHit: bool}
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  createdAt: timestamp("created_at").defaultNow(),
  userId: uuid("user_id"),
  provider: text("provider"),
  route: text("route"),
  replanTool: text("replan_tool"),
  replanReason: text("replan_reason"),
  intentLabel: text("intent_label"),
  judgeVerdict: text("judge_verdict"),
  judgeConfidence: numeric("judge_confidence"),
  judgeRationale: text("judge_rationale"),
  judgeMode: text("judge_mode"),
  judgeDisagreedWithHeuristic: boolean("judge_disagreed_with_heuristic"),
}, (t) => [
  pgPolicy("Users can view own query logs", {
    for: "select",
    to: ["authenticated", "anon"],
    using: sql`auth.uid() = user_id`,
  }),
  pgPolicy("Users can insert own query logs", {
    for: "insert",
    to: ["authenticated", "anon"],
    withCheck: sql`auth.uid() = user_id`,
  }),
]);

export const insertDocumentSchema =
  createInsertSchema(documents)
    .omit({ id: true })
    .extend({
      content: z.string().min(1),
      metadata: z.record(z.string(), z.any()).optional(),
      embedding: z.array(z.number().finite()).length(3072).optional().nullable(),
      userId: z.string().uuid().optional().nullable(),
    });

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

// Request types
export const ingestSchema = z.object({
  text: z.string().min(1),
  userId: z.string().optional(),
});

export const querySchema = z.object({
  question: z.string().min(1),
  userId: z.string().optional(),
  queryMode: z.enum(["core", "session"]).optional(),
});

export type IngestRequest = z.infer<typeof ingestSchema>;
export type QueryRequest = z.infer<typeof querySchema>;

export interface QueryResponse {
  answer: string;
  sources: string[];
}
