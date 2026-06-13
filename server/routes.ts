import { performance } from "perf_hooks";
import type { Express } from "express";
import type { Server } from "http";
import { api } from "@shared/routes";
import { GeminiAdapter } from "./services/geminiAdapter";
import { storage } from "./storage";
import { withGeminiRetries, getAnswer, isUncertainAnswer, cosineSimilarity } from "./services/geminiClient";
import {
  analyzeQuestionStructure,
  performUncertaintyFallback,
  formatLocalContext,
  getQuestionRelevanceScore,
} from "./services/queryAnalyzer";
import {
  decideReplanTool,
  executeReplanTool,
  shouldInvokeReplanGate,
  type ReplanGateDecision,
  type ReplanGateInput,
} from "./services/queryReplanGate";
import { QUERY_ROUTES, REPLAN_TOOLS } from "./services/queryRoutes";
import { AI_MODELS, AI_CONFIG } from "./services/aiConfig";
import {
  getVectorStore,
  addToVectorStore,
  removeFromVectorStoreBySession,
  syncDocsFromDiskAndReloadVectorStore,
} from "./services/vectorStoreService";
import { queryCache } from "./services/cacheService";
import {
  createPendingSessionManifest,
  filterSearchableVectorDocs,
  newPrepId,
  runSessionPrep,
  type EmbedFn,
} from "./services/prepBot";
import { emitPrepUpdate, prepChannelKey, subscribePrepUpdates, writeSseEvent } from "./services/prepEvents";
import { getManifestPayload, type PrepStatusPayload } from "./services/prepPayload";

const TOP_K_CHUNKS = 5;
/** Below this blended top-K relevance score, skip local synthesis and fall back to web search. */
const WEB_FALLBACK_SIMILARITY = 0.1;

async function getEmbedding(
  ai: GeminiAdapter,
  prompt: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" = "RETRIEVAL_QUERY",
): Promise<number[]> {
  const response = (await withGeminiRetries("embedContent", () =>
    ai.models.embedContent({
      model: AI_MODELS.EMBEDDING,
      contents: [prompt],
      config: { taskType },
    }),
  )) as { embeddings?: { values: number[] }[] };
  if (response.embeddings && response.embeddings.length > 0) {
    return response.embeddings[0].values;
  }
  return [];
}

function rankChunksBySimilarity(
  embedding: number[],
  vectorStore: ReturnType<typeof getVectorStore>,
) {
  return vectorStore
    .map((doc) => ({
      ...doc,
      similarity: doc.embedding.length ? cosineSimilarity(embedding, doc.embedding) : 0,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TOP_K_CHUNKS);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  const ai = new GeminiAdapter({
    useVertex: process.env.USE_VERTEX_AI === "true",
    apiKey: process.env.GEMINI_API_KEY,
    projectId: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_LOCATION,
  });

  const embedFn: EmbedFn = (text, taskType) => getEmbedding(ai, text, taskType ?? "RETRIEVAL_DOCUMENT");

  void syncDocsFromDiskAndReloadVectorStore(ai, embedFn).catch((e) =>
    console.error("[RAG Demo] Background doc sync failed:", e),
  );

  queryCache.loadFromDisk();
  setInterval(() => queryCache.saveToDisk(), 5 * 60 * 1000);

  // Session-scoped routes treat req.body.userId as proof of authentication.
  // server/index.ts runs before all /api handlers: it validates Authorization: Bearer <JWT>
  // via Supabase auth.getUser() and, on success, sets req.body.userId to the Supabase user id.
  // No userId means no valid token was sent (or verification failed) — not an anonymous session id.

  app.get(api.rag.sessionStatus.path, async (req, res) => {
    try {
      const userId = req.body.userId as string | undefined;
      if (!userId) {
        return res.json({ hasDocument: false, prepStatus: "none" });
      }

      const manifest = await storage.getManifest(userId);
      const payload = getManifestPayload(manifest);
      res.json({
        hasDocument: !!manifest,
        prepStatus: payload.prepStatus,
      });
    } catch (error) {
      console.error("Session status error:", error);
      res.status(500).json({ message: "Failed to check session status" });
    }
  });

  app.get(api.rag.prepStatus.path, async (req, res) => {
    try {
      const queryMode = req.query.queryMode === "session" ? "session" : "core";
      const userId = req.body.userId as string | undefined;

      if (queryMode === "session") {
        // Custom resume is per-user; without middleware-injected userId the client is not authed.
        if (!userId) return res.json({ prepStatus: "none" });
        const manifest = await storage.getManifest(userId);
        return res.json(getManifestPayload(manifest));
      }

      const manifest = await storage.getCoreManifest();
      return res.json(getManifestPayload(manifest));
    } catch (error) {
      console.error("Prep status error:", error);
      res.status(500).json({ message: "Failed to check prep status" });
    }
  });

  app.get(api.rag.prepStream.path, async (req, res) => {
    const queryMode = req.query.queryMode === "session" ? "session" : "core";
    const userId = req.body.userId as string | undefined;

    // Core prep is global (knowledge/ folder); session stream is private and requires JWT → userId.
    if (queryMode === "session" && !userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const channelKey = queryMode === "core" ? prepChannelKey("core") : prepChannelKey("session", userId);
    let closed = false;
    let unsubscribe: (() => void) | null = null;

    const closeStream = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe?.();
      res.end();
    };

    const push = (payload: PrepStatusPayload) => {
      if (closed) return;
      writeSseEvent(res, payload);
      if (payload.prepStatus === "ready" || payload.prepStatus === "failed") {
        closeStream();
      }
    };

    const heartbeat = setInterval(() => {
      if (!closed) res.write(": ping\n\n");
    }, 25000);

    req.on("close", closeStream);

    try {
      const manifest =
        queryMode === "core"
          ? await storage.getCoreManifest()
          : // userId defined: session branch returned 401 above when missing
            await storage.getManifest(userId!);
      const initial = getManifestPayload(manifest);
      push(initial);

      if (initial.prepStatus === "pending" && !closed) {
        unsubscribe = subscribePrepUpdates(channelKey, push);
      } else if (!closed) {
        closeStream();
      }
    } catch (error) {
      console.error("Prep stream error:", error);
      if (!closed) {
        writeSseEvent(res, { prepStatus: "failed", prepError: "Stream error" });
        closeStream();
      }
    }
  });

  app.post(api.rag.ingest.path, async (req, res) => {
    try {
      const { text, userId } = api.rag.ingest.input.parse(req.body);

      // Ingest always targets the caller's session manifest; userId only exists after JWT middleware.
      if (!userId) {
        return res.status(400).json({
          message: "Authentication required. Core resume is loaded from the knowledge folder at startup.",
        });
      }

      const prepId = newPrepId();
      console.log(`[RAG] Session upload for user ${userId}, prepId=${prepId}`);

      await storage.deleteUserDocuments(userId);
      removeFromVectorStoreBySession(userId);

      const manifest = await createPendingSessionManifest(userId, prepId);
      addToVectorStore({
        id: manifest.id,
        content: manifest.content,
        embedding: [],
        metadata: manifest.metadata as Record<string, unknown>,
      });

      queryCache.invalidateSessionCache(userId);

      emitPrepUpdate("session", userId, { prepStatus: "pending" });

      void runSessionPrep(ai, userId, text, prepId, embedFn).catch((e) =>
        console.error("[PrepBot] Unhandled session prep error:", e),
      );

      res.json({
        success: true,
        message: "Resume received. Analysis running in the background.",
        prepId,
      });
    } catch (error: any) {
      console.error("Ingest error:", error);
      res.status(500).json({ message: `Failed to ingest document: ${error.message || String(error)}` });
    }
  });

  app.post(api.rag.query.path, async (req, res) => {
    const totalStart = performance.now();
    const stepDurations: Record<string, number> = {};

    try {
      const { question, userId, queryMode } = api.rag.query.input.parse(req.body);
      const mode = queryMode || "core";

      const cachedResponse =
        mode !== "session" || AI_CONFIG.DEMO_MODE
          ? queryCache.getResponse(question, mode, userId)
          : null;
      if (cachedResponse) {
        console.log(`[Cache] Full response cache hit (${mode} mode)`);
        void storage.insertQueryLog({
          question,
          queryMode: mode,
          userId,
          route: QUERY_ROUTES.CACHE,
          totalDurationMs: Math.round(performance.now() - totalStart),
          relevanceScore: cachedResponse.relevanceScore || 0,
          modelsUsed: { synthesis: "cache", analysis: "cache", embedding: "cache" },
          stepDurations: { total: Math.round(performance.now() - totalStart) },
          cacheStatus: { embeddingHit: true, webSearchHit: false, responseHit: true },
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          provider: "cache",
        }).catch((e) => console.error(e));

        return res.json({ ...cachedResponse, _cacheHit: true, _route: QUERY_ROUTES.CACHE });
      }

      const analysisStart = performance.now();
      const questionStructure = analyzeQuestionStructure(question);
      stepDurations.analysis = Math.round(performance.now() - analysisStart);

      const vectorStore = filterSearchableVectorDocs(getVectorStore(), mode, userId);

      if (mode === "session" && userId) {
        const manifest = await storage.getManifest(userId);
        const prepStatus = (manifest?.metadata as Record<string, unknown> | null)?.prepStatus;

        if (!manifest) {
          return res.json({
            answer:
              "You haven't uploaded your resume for this session yet. Please paste your resume in the Custom Resume section above.",
            sources: [],
          });
        }

        if (prepStatus === "pending") {
          return res.json({
            answer:
              "Your resume is still being analyzed. Please wait a moment and try again — starter questions will appear when indexing finishes.",
            sources: [],
          });
        }

        if (prepStatus === "failed") {
          return res.json({
            answer:
              "Resume analysis failed. Please try uploading your resume again.",
            sources: [],
          });
        }
      }

      if (mode === "session" && vectorStore.length === 0) {
        return res.json({
          answer:
            "Your resume is still being indexed. Please wait a moment and try again.",
          sources: [],
        });
      }

      let embedding: number[] = [];
      let embeddingCacheHit = false;

      if (vectorStore.length > 0) {
        const embedStart = performance.now();
        try {
          const cachedEmbedding = queryCache.getEmbedding(question);
          if (cachedEmbedding) {
            embedding = cachedEmbedding;
            embeddingCacheHit = true;
          } else {
            embedding = await getEmbedding(ai, question);
            queryCache.setEmbedding(question, embedding);
          }
          stepDurations.embedding = Math.round(performance.now() - embedStart);
        } catch (embedErr) {
          console.error("[RAG] Query embedding failed, falling back to web search", embedErr);
          const fallbackResponse = await performUncertaintyFallback(
            ai,
            question,
            [],
            0,
            questionStructure,
            false,
            mode,
            userId,
          );
          void storage.insertQueryLog({ question, queryMode: mode, userId, ...fallbackResponse.telemetry }).catch(console.error);
          return res.json(fallbackResponse);
        }
      }

      let results: any[] = [];
      let relevanceScore = 0;

      if (vectorStore.length > 0 && embedding.length > 0) {
        relevanceScore = getQuestionRelevanceScore(embedding, vectorStore, TOP_K_CHUNKS);
        results = rankChunksBySimilarity(embedding, vectorStore);
      }

      const isHybridSearch = questionStructure.isAdviceQuestion || questionStructure.isComplex;
      const preferLocalRag =
        questionStructure.isSimpleFactualLookup && results.length > 0;

      if (relevanceScore < WEB_FALLBACK_SIMILARITY && !isHybridSearch && !preferLocalRag) {
        const fallbackResponse = await performUncertaintyFallback(
          ai,
          question,
          results,
          relevanceScore,
          questionStructure,
          embeddingCacheHit,
          mode,
          userId,
        );
        void storage.insertQueryLog({ question, queryMode: mode, userId, ...fallbackResponse.telemetry }).catch(console.error);
        return res.json(fallbackResponse);
      }

      if (results.length === 0) {
        const fallbackResponse = await performUncertaintyFallback(
          ai,
          question,
          results,
          relevanceScore,
          questionStructure,
          embeddingCacheHit,
          mode,
          userId,
        );
        void storage.insertQueryLog({ question, queryMode: mode, userId, ...fallbackResponse.telemetry }).catch(console.error);
        return res.json(fallbackResponse);
      }

      const synthesisStart = performance.now();
      const context = formatLocalContext(results);
      const sources = results.map((r) => {
        const section = r.metadata?.section ? `[${r.metadata.section}] ` : "";
        const company = r.metadata?.company ? `${r.metadata.company}: ` : "";
        return section + company + r.content.substring(0, 80) + "...";
      });
      const prompt = `You are a helpful assistant. Answer based ONLY on the following context. If unknown, say you don't know.\n\nContext:\n${context}\n\nQuestion: ${question}`;
      const { text: answer, usage: synthesisUsage } = await getAnswer(ai, prompt);
      stepDurations.synthesis = Math.round(performance.now() - synthesisStart);

      if (isUncertainAnswer(answer)) {
        const gateInput: ReplanGateInput = {
          question,
          localAnswer: answer,
          relevanceScore,
          isAdviceQuestion: questionStructure.isAdviceQuestion,
          isComplex: questionStructure.isComplex,
          isSimpleFactualLookup: questionStructure.isSimpleFactualLookup,
          hasLocalChunks: results.length > 0,
          trigger: "uncertain_local_answer",
        };

        let replanDecision: ReplanGateDecision = {
          tool: REPLAN_TOOLS.HYBRID_WEB,
          reason: "gate_skipped",
          confidence: 0,
        };
        if (shouldInvokeReplanGate(gateInput)) {
          const replanStart = performance.now();
          replanDecision = await decideReplanTool(ai, gateInput);
          stepDurations.replanGate = Math.round(performance.now() - replanStart);
        }

        const { body: replanBody, stepDurations: replanSteps } = await executeReplanTool({
          ai,
          question,
          localAnswer: answer,
          localResults: results,
          relevanceScore,
          structure: questionStructure,
          embeddingCacheHit,
          queryMode: mode,
          sessionId: userId,
          decision: replanDecision,
          rankChunks: (emb) => rankChunksBySimilarity(emb, vectorStore),
          embedQuestion: (q) => getEmbedding(ai, q),
        });
        Object.assign(stepDurations, replanSteps);

        const fallbackResponse = {
          ...replanBody,
          telemetry: {
            ...(replanBody.telemetry as Record<string, unknown>),
            totalDurationMs: Math.round(performance.now() - totalStart),
            stepDurations,
          },
        };
        void storage.insertQueryLog({ question, queryMode: mode, userId, ...fallbackResponse.telemetry }).catch(console.error);
        return res.json(fallbackResponse);
      }

      const successBody = {
        answer,
        sources,
        relevanceScore: Number(relevanceScore.toFixed(4)),
        isAdviceQuestion: questionStructure.isAdviceQuestion,
        _route: QUERY_ROUTES.LOCAL_RAG,
        _cache: { embeddingHit: embeddingCacheHit, webSearchHit: false },
        telemetry: {
          route: QUERY_ROUTES.LOCAL_RAG,
          totalDurationMs: Math.round(performance.now() - totalStart),
          stepDurations,
          relevanceScore: parseFloat(relevanceScore.toFixed(3)),
          provider: process.env.USE_VERTEX_AI === "true" ? "GCP Vertex AI" : "Google AI Studio",
          modelsUsed: {
            synthesis: AI_MODELS.DEFAULT_ANSWERING_FALLBACKS[0],
            analysis: QUERY_ROUTES.LOCAL_RAG,
            embedding: AI_MODELS.EMBEDDING,
          },
          cacheStatus: { embeddingHit: embeddingCacheHit, webSearchHit: false, responseHit: false },
          promptTokens: synthesisUsage?.promptTokenCount || 0,
          completionTokens: synthesisUsage?.candidatesTokenCount || 0,
          totalTokens: synthesisUsage?.totalTokenCount || 0,
        },
      };

      queryCache.setResponse(question, successBody, mode, userId);
      if (AI_CONFIG.DEMO_MODE) queryCache.saveToDisk();

      void storage.insertQueryLog({ question, queryMode: mode, userId, ...successBody.telemetry }).catch(console.error);
      return res.json(successBody);
    } catch (error: any) {
      console.error("Query error:", error);
      res.status(500).json({ message: `Failed to process query: ${error.message || String(error)}` });
    }
  });

  return httpServer;
}
