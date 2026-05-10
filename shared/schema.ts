import { pgTable, text, serial, jsonb, vector, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { createHash } from "crypto";

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
});

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
});

export const insertDocumentSchema = 
createInsertSchema(documents)
  .omit({ id: true })
  .extend({
    content: z.string().min(1),
    metadata: z.record(z.string(), z.any()).optional(),
    embedding: z.array(z.number().finite()).length(3072),
  });

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

// Request types
export const ingestSchema = z.object({
  text: z.string().min(1),
  sessionId: z.string().optional(),
});

export const querySchema = z.object({
  question: z.string().min(1),
  sessionId: z.string().optional(),
  queryMode: z.enum(["core", "session"]).optional(),
});

export type IngestRequest = z.infer<typeof ingestSchema>;
export type QueryRequest = z.infer<typeof querySchema>;

export interface QueryResponse {
  answer: string;
  sources: string[];
}
