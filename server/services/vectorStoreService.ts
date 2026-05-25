/**
 * Vector store service
 * Manages document embeddings and vector store operations
 */

import path from "path";
import fs from "fs";
import type { Document } from "@shared/schema";
import { hashContent } from "@shared/schema";
import { DOC_TYPES } from "@shared/resumeTypes";
import { isCorePrepReady } from "@shared/documentFilters";
import { storage } from "../storage";
import { runCorePrepForSource, type EmbedFn } from "./prepBot";

export interface VectorDoc {
  id: number;
  content: string;
  embedding: number[];
  metadata?: Record<string, any> | null;
}

let vectorStore: VectorDoc[] = [];

export function setVectorStore(docs: VectorDoc[]): void {
  vectorStore = docs;
}

export function getVectorStore(): VectorDoc[] {
  return vectorStore;
}

export function addToVectorStore(doc: VectorDoc): void {
  vectorStore.push(doc);
}

export function removeFromVectorStoreBySession(userId: string): void {
  vectorStore = vectorStore.filter((doc) => doc.metadata?.userId !== userId);
}

export function removeFromVectorStoreBySource(source: string): void {
  vectorStore = vectorStore.filter((doc) => doc.metadata?.source !== source);
}

export async function reloadVectorStoreFromDb(): Promise<void> {
  const updatedDocs = await storage.getDocuments();
  vectorStore = updatedDocs
    .filter((doc): doc is Document & { embedding: number[] | null } => true)
    .map((doc) => ({
      id: doc.id,
      content: doc.content,
      embedding: (doc.embedding as number[] | null) ?? [],
      metadata: doc.metadata as Record<string, unknown> | null,
    }));
  console.log("[CVLM] vectorStore reloaded:", vectorStore.length, "documents");
}

export async function cleanupExpiredSessions(): Promise<void> {
  try {
    await storage.deleteExpiredSessions();
    const now = Date.now();
    const initialLength = vectorStore.length;

    vectorStore = vectorStore.filter((doc) => {
      if (doc.metadata && doc.metadata.expiresAt) {
        return doc.metadata.expiresAt >= now;
      }
      return true;
    });

    if (vectorStore.length !== initialLength) {
      console.log(`[CVLM] Cleaned up ${initialLength - vectorStore.length} expired session vectors.`);
    }
  } catch (error) {
    console.error("[CVLM] Failed to cleanup expired sessions", error);
  }
}

/**
 * Syncs resume files from knowledge/ and reloads the vector store.
 * Runs prep bot when content hash changes (manifest + chunks in DB).
 */
export async function syncDocsFromDiskAndReloadVectorStore(
  ai: unknown,
  getEmbedding: EmbedFn,
): Promise<void> {
  const docsDir = path.join(process.cwd(), "knowledge");
  let files: string[];
  try {
    files = fs.readdirSync(docsDir).filter((f) => !f.endsWith(".json"));
  } catch (e) {
    console.error(`[RAG Demo] Could not read docs dir: ${docsDir}`, e);
    return;
  }

  const existingDocs = await storage.getDocuments();

  for (const file of files) {
    const content = fs.readFileSync(path.join(docsDir, file), "utf-8");
    const hash = hashContent(content);

    if (isCorePrepReady(existingDocs, file, hash, DOC_TYPES.CORE_MANIFEST)) {
      console.log(`[RAG Demo] ${file} unchanged and prepped, skipping`);
      continue;
    }

    console.log(`[RAG Demo] ${file} needs prep (new or updated)`);
    removeFromVectorStoreBySource(file);
    await runCorePrepForSource(ai, file, content, hash, getEmbedding);
  }

  await reloadVectorStoreFromDb();
  await cleanupExpiredSessions();
}
