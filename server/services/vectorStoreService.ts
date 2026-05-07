/**
 * Vector store service
 * Manages document embeddings and vector store operations
 */

import path from "path";
import fs from "fs";
import type { Document } from "@shared/schema";
import { hashContent } from "@shared/schema";
import { storage } from "../storage";

export interface VectorDoc {
  id: number;
  content: string;
  embedding: number[];
  metadata?: Record<string, any> | null;
}

// In-memory vector store
let vectorStore: VectorDoc[] = [];

export function getVectorStore(): VectorDoc[] {
  return vectorStore;
}

export function setVectorStore(docs: VectorDoc[]): void {
  vectorStore = docs;
}

export function addToVectorStore(doc: VectorDoc): void {
  vectorStore.push(doc);
}

export function removeFromVectorStoreBySession(sessionId: string): void {
  vectorStore = vectorStore.filter(doc => doc.metadata?.sessionId !== sessionId);
}

export async function cleanupExpiredSessions(): Promise<void> {
  try {
    await storage.deleteExpiredSessions();
    const now = Date.now();
    const initialLength = vectorStore.length;
    
    vectorStore = vectorStore.filter(doc => {
      if (doc.metadata && doc.metadata.expiresAt) {
        return doc.metadata.expiresAt >= now;
      }
      return true; // Keep core documents without expiresAt
    });
    
    if (vectorStore.length !== initialLength) {
      console.log(`[CVLM] Cleaned up ${initialLength - vectorStore.length} expired session vectors.`);
    }
  } catch (error) {
    console.error("[CVLM] Failed to cleanup expired sessions", error);
  }
}

/**
 * Syncs documents from disk and reloads the vector store
 * Called on server startup to index knowledge/ directory
 */
export async function syncDocsFromDiskAndReloadVectorStore(
  getEmbedding: (prompt: string) => Promise<number[]>
): Promise<void> {
  const docsDir = path.join(process.cwd(), "knowledge");
  let files: string[];
  try {
    files = fs.readdirSync(docsDir).filter(f => !f.endsWith(".json"));
  } catch (e) {
    console.error(`[RAG Demo] Could not read docs dir: ${docsDir}`, e);
    return;
  }
  const existingDocs = await storage.getDocuments();
  for (const file of files) {
    const content = fs.readFileSync(path.join(docsDir, file), "utf-8");
    const hash = hashContent(content);

    const existing = existingDocs.find((doc) => {
      const metadata = (doc.metadata ?? null) as Record<string, unknown> | null;
      return metadata?.source === file;
    });

    if (existing) {
      const metadata = (existing.metadata ?? null) as Record<string, unknown> | null;
      if (metadata?.hash === hash && existing.embedding) {
        console.log(`[RAG Demo] ${file} unchanged, skipping`);
        continue;
      }
      console.log(`[RAG Demo] ${file} needs ${existing.embedding ? 'update' : 'initial embedding'}, processing`);
      const embedding = await getEmbedding(content);
      await storage.updateDocument(existing.id, {
        content,
        embedding,
        metadata: { source: file, hash },
      });
    } else {
      console.log(`[RAG Demo] ${file} new, ingesting`);
      const embedding = await getEmbedding(content);
      await storage.addDocuments([
        { content, embedding, metadata: { source: file, hash } },
      ]);
    }
  }

  const updatedDocs = await storage.getDocuments();
  console.log(`[RAG Demo] Loading ${updatedDocs.length} documents...`);
  vectorStore = updatedDocs
    .filter((doc): doc is Document & { embedding: number[] } => doc.embedding !== null)
    .map((doc) => ({
      ...doc,
      embedding: doc.embedding!,
      metadata: doc.metadata as Record<string, any> | null,
    }));

  console.log("[RAG Demo] vectorStore size:", vectorStore.length);
  await cleanupExpiredSessions();
}
