/**
 * Background prep bot: chunks resume text and extracts profile + brief
 * for manifest row metadata.
 */

import { randomUUID } from "crypto";
import { withGeminiRetries } from "./geminiClient.ts";
import { AI_MODELS } from "./aiConfig.ts";
import { storage } from "../storage";
import { DOC_TYPES } from "@shared/resumeTypes";
import { filterSearchableDocs } from "@shared/documentFilters";
import {
  buildChunkIndexSummary,
  fallbackPrep,
  normalizePrepResult,
  parsePrepJsonFromModel,
} from "./prepParser.ts";
import type { PrepResult } from "@shared/resumeTypes";
import type { Document } from "@shared/schema";
import {
  addToVectorStore,
  removeFromVectorStoreBySession,
  type VectorDoc,
} from "./vectorStoreService";
import { emitPrepUpdate } from "./prepEvents.ts";
import { getManifestPayload } from "./prepPayload.ts";

const MANIFEST_PLACEHOLDER = "[manifest]";

export type EmbedFn = (
  text: string,
  taskType?: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT",
) => Promise<number[]>;

export async function runPrepBot(ai: unknown, text: string): Promise<PrepResult> {
  const prompt = `Analyze the following resume and return ONLY valid JSON with this exact shape:
{
  "chunks": [
    { "content": "self-contained text for one section", "section": "experience|education|skills|projects|summary|other", "company": "optional company name", "chunkIndex": 0 }
  ],
  "profile": {
    "name": "string or null",
    "title": "string or null",
    "location": "string or null",
    "seniority": "string or null",
    "yearsExperience": number or null,
    "skills": { "languages": [], "frameworks": [], "domains": [] },
    "highlights": ["short achievement strings"]
  },
  "brief": {
    "summary": "2-3 sentence hiring summary",
    "proofPoints": ["dated or scoped proof points"],
    "starterQuestions": ["4-5 starter questions: mostly factual lookups plus one career-angle question"]
  }
}

Rules:
- Split the resume into logical chunks (one role, project block, skills section, etc.). Aim for 6-15 chunks.
- Each chunk must be self-contained and preserve original wording where possible.
- starterQuestions (4-5 total):
  - Write every question in first person (I, me, my) — the user clicks them verbatim. Never use the candidate's name or any proper name from the resume.
  - Include 3-4 simple factual lookups answerable from the resume alone (What / Where / Which; under ~15 words; you may name employers, titles, tools, or schools).
  - Include exactly 1 career-advice-style question grounded in their history (strengths, role fit, or next-step direction). Light inference from the resume only; no outside market data or long behavioral prompts.
  - Good factual: "What was my title at Acme?", "Which languages are listed in my skills?"
  - Good career (one only): "What kinds of roles does my background fit best?", "What are my strongest areas to highlight in interviews?"
  - Bad: using the person's name ("What did Jane build at Acme?"), generic coaching with no resume tie-in, trick questions, or multi-part interview scenarios.

Resume:
${text}`;

  try {
    const response = (await withGeminiRetries("prepBot", () =>
      (ai as { models: { generateContent: (args: unknown) => Promise<unknown> } }).models.generateContent({
        model: AI_MODELS.FAST_WORKHORSE,
        contents: prompt,
      }),
    )) as { text?: string };

    if (!response.text) return fallbackPrep(text);
    return normalizePrepResult(parsePrepJsonFromModel(response.text), text);
  } catch (e) {
    console.error("[PrepBot] Failed, using fallback chunking:", e);
    return fallbackPrep(text);
  }
}

export async function persistPreparedResume(params: {
  prep: PrepResult;
  manifestType: typeof DOC_TYPES.CORE_MANIFEST | typeof DOC_TYPES.SESSION_MANIFEST;
  getEmbedding: EmbedFn;
  userId?: string;
  source?: string;
  hash?: string;
  expiresAt?: number;
  prepId?: string;
}): Promise<{ manifest: Document; chunks: Document[] }> {
  const { prep, manifestType, getEmbedding, userId, source, hash, expiresAt, prepId } = params;

  const chunkEmbeddings = await Promise.all(
    prep.chunks.map((chunk) => getEmbedding(chunk.content, "RETRIEVAL_DOCUMENT")),
  );

  const chunkIndex = buildChunkIndexSummary(prep.chunks);

  const manifestMetadata: Record<string, unknown> = {
    type: manifestType,
    prepStatus: "ready",
    prepId,
    profile: prep.profile,
    brief: prep.brief,
    chunkIndex,
  };
  if (source) manifestMetadata.source = source;
  if (hash) manifestMetadata.hash = hash;
  if (userId) manifestMetadata.userId = userId;
  if (expiresAt) manifestMetadata.expiresAt = expiresAt;

  const manifest = await storage.createDocument({
    content: MANIFEST_PLACEHOLDER,
    metadata: manifestMetadata,
    embedding: null,
    userId: userId ?? null,
  });

  const chunkDocs = await storage.addDocuments(
    prep.chunks.map((chunk, i) => ({
      content: chunk.content,
      embedding: chunkEmbeddings[i],
      userId: userId ?? null,
      metadata: {
        type: DOC_TYPES.CHUNK,
        section: chunk.section,
        company: chunk.company ?? undefined,
        chunkIndex: chunk.chunkIndex,
        source,
        hash,
        userId,
        expiresAt,
        prepId,
      },
    })),
  );

  return { manifest, chunks: chunkDocs };
}

export function applyDocumentsToVectorStore(docs: { manifest: Document; chunks: Document[] }): void {
  addToVectorStore({
    id: docs.manifest.id,
    content: docs.manifest.content,
    embedding: [],
    metadata: docs.manifest.metadata as Record<string, unknown>,
  });

  for (const chunk of docs.chunks) {
    if (!chunk.embedding) continue;
    addToVectorStore({
      id: chunk.id,
      content: chunk.content,
      embedding: chunk.embedding as number[],
      metadata: chunk.metadata as Record<string, unknown>,
    });
  }
}

export async function runCorePrepForSource(
  ai: unknown,
  source: string,
  text: string,
  hash: string,
  getEmbedding: EmbedFn,
): Promise<void> {
  console.log(`[PrepBot] Core prep starting for ${source}`);
  await storage.deleteCoreDocumentsBySource(source);

  const prep = await runPrepBot(ai, text);
  const docs = await persistPreparedResume({
    prep,
    manifestType: DOC_TYPES.CORE_MANIFEST,
    getEmbedding,
    source,
    hash,
  });

  applyDocumentsToVectorStore(docs);
  emitPrepUpdate("core", undefined, getManifestPayload(docs.manifest));
  console.log(`[PrepBot] Core prep ready for ${source} (${docs.chunks.length} chunks)`);
}

export async function runSessionPrep(
  ai: unknown,
  userId: string,
  text: string,
  prepId: string,
  getEmbedding: EmbedFn,
): Promise<void> {
  console.log(`[PrepBot] Session prep starting for user ${userId}`);

  try {
    const prep = await runPrepBot(ai, text);
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    const currentManifest = await storage.getManifest(userId);
    if (
      !currentManifest?.metadata ||
      (currentManifest.metadata as Record<string, unknown>).prepId !== prepId
    ) {
      console.log(`[PrepBot] Stale prep run for ${userId}, skipping`);
      return;
    }

    await storage.deleteUserDocuments(userId);
    removeFromVectorStoreBySession(userId);

    const docs = await persistPreparedResume({
      prep,
      manifestType: DOC_TYPES.SESSION_MANIFEST,
      getEmbedding,
      userId,
      expiresAt,
      prepId,
    });

    applyDocumentsToVectorStore(docs);
    emitPrepUpdate("session", userId, getManifestPayload(docs.manifest));
    console.log(`[PrepBot] Session prep ready for ${userId} (${docs.chunks.length} chunks)`);
  } catch (e) {
    console.error(`[PrepBot] Session prep failed for ${userId}:`, e);
    await storage.updateManifestPrepStatus(userId, "failed", prepId, String(e));
    const manifest = await storage.getManifest(userId);
    emitPrepUpdate("session", userId, getManifestPayload(manifest));
  }
}

export async function createPendingSessionManifest(
  userId: string,
  prepId: string,
): Promise<Document> {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  return storage.createDocument({
    content: MANIFEST_PLACEHOLDER,
    embedding: null,
    userId,
    metadata: {
      type: DOC_TYPES.SESSION_MANIFEST,
      prepStatus: "pending",
      prepId,
      userId,
      expiresAt,
    },
  });
}

export function filterSearchableVectorDocs(
  docs: VectorDoc[],
  queryMode: "core" | "session",
  userId?: string,
): VectorDoc[] {
  return filterSearchableDocs(docs, queryMode, userId) as VectorDoc[];
}

export function newPrepId(): string {
  return randomUUID();
}
