import type { Express } from "express";
import { createServer, type Server } from "http";
import { api } from "@shared/routes";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { storage } from "./storage";
import { withGeminiRetries, cosineSimilarity, getAnswer, isUncertainAnswer } from "./services/geminiClient";
import { searchWeb, type WebSearchItem } from "./services/webSearch";
import { 
  analyzeQuestionStructure, 
  getQuestionRelevanceScore, 
  suggestQuestionBreakdown,
  generateSearchQuery,
  performUncertaintyFallback,
  formatLocalContext,
  formatWebContext,
  extractDocumentMetadata
} from "./services/queryAnalyzer";
import { AI_MODELS, AI_CONFIG } from "./services/aiConfig";
import {
  getVectorStore,
  addToVectorStore,
  removeFromVectorStoreBySession,
  syncDocsFromDiskAndReloadVectorStore,
} from "./services/vectorStoreService";
import { queryCache, hashQuestion, normalizeQuestion } from "./services/cacheService";

const WEB_FALLBACK_SIMILARITY = 0.55;



/**
 * Generates an embedding vector for a given prompt.
 * Uses the 2026 standard text-embedding-004 model.
 */
async function getEmbedding(ai: any, prompt: string): Promise<number[]> {
  const response = (await withGeminiRetries("embedContent", () =>
    ai.models.embedContent({
      model: AI_MODELS.EMBEDDING,
      contents: [prompt],
      config: { taskType: "RETRIEVAL_QUERY" },
    }),
  )) as { embeddings?: { values: number[] }[] };
  if (response.embeddings && response.embeddings.length > 0) {
    return response.embeddings[0].values;
  }
  return [];
}



export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Initialize Gemini client
  // Note: This requires GEMINI_API_KEY env var to be set
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  //const model = ai.getGenerativeModel({        model: AI_MODELS.FAST_WORKHORSE, });
  // const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
  //await listModels();

  async function listModels() {
    const pager = await ai.models.list();

    // The Pager object stores the actual array in .models 
    // or .result.models depending on the specific response wrap.
    for await (const m of pager) {
      console.log({
        name: m.name,
        actions: m.supportedActions,
      });
    }  
  }

  // Don't block HTTP + Vite startup on embeddings (Gemini outages can hang for minutes).
  void syncDocsFromDiskAndReloadVectorStore(
    (prompt) => getEmbedding(ai, prompt)
  ).catch((e) =>
    console.error("[RAG Demo] Background doc sync failed:", e),
  );

  // Ideally we store embeddings in DB. For this minimal demo, we'll
  // just start fresh or lazy-load if we added persistence for embeddings.
  // To keep it fast and minimal, we'll start with empty vector store
  // and only use what's added in this session or implement simple re-indexing.
  
  // For the purpose of this "minimal demo", we won't re-embed everything on restart 
  // to avoid API costs/latency loop, but we will store text in DB.
  
  // Initialize cache and load from disk
  queryCache.loadFromDisk();
  
  // Periodically persist cache to disk (every 5 mins)
  setInterval(() => queryCache.saveToDisk(), 5 * 60 * 1000);

  app.get(api.rag.sessionStatus.path, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const vectorStore = getVectorStore();
      const hasDocument = vectorStore.some(doc => doc.metadata?.sessionId === sessionId);
      res.json({ hasDocument });
    } catch (error) {
      console.error("Session status error:", error);
      res.status(500).json({ message: "Failed to check session status" });
    }
  });

  app.post(api.rag.ingest.path, async (req, res) => {
    try {
      const { text, sessionId } = api.rag.ingest.input.parse(req.body);

      // 1. Generate Embedding
      const embedding = await getEmbedding(ai, text);
      console.log("EMBEDDING result:", embedding);

      // 2. Extract Identity Metadata
      const identityMetadata = await extractDocumentMetadata(ai, text);
      console.log("[RAG] Extracted identity:", identityMetadata);
      
      // 3. Clear previous session data if this is a session-based upload
      // This prevents "cumulative knowledge" where old resumes hang around
      if (sessionId) {
        console.log(`[RAG] Updating resume for session ${sessionId}: clearing old documents`);
        await storage.deleteSessionDocuments(sessionId);
        removeFromVectorStoreBySession(sessionId);
      }

      // 4. Store in DB (for persistence)
      let metadata: any = { ...identityMetadata };
      if (sessionId) {
        metadata = {
          ...metadata,
          sessionId,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        };
      }
      const doc = await storage.createDocument({ content: text, metadata, embedding });

      // 3. Update in-memory vector store
      addToVectorStore({
        id: doc.id,
        content: doc.content,
        embedding: embedding,
        metadata,
      });

      // 4. Invalidate response caches since new knowledge was added
      // This prevents serving stale answers that should now be updated
      if (!sessionId) {
        queryCache.invalidateOnDocumentIngest(doc.id);
      } else {
        // For session-based uploads, specifically clear the previous analysis of that session
        queryCache.invalidateSessionCache(sessionId);
      }

      res.json({ success: true, message: "Document ingested successfully" });
    } catch (error) {
      console.error("Ingest error:", error);
      res.status(500).json({ message: "Failed to ingest document" });
    }
  });

  app.post(api.rag.query.path, async (req, res) => {
    try {
      const { question, sessionId, queryMode } = api.rag.query.input.parse(req.body);

      // 0. Check response cache first (only for core queries unless in demo mode)
      const cachedResponse = (queryMode !== 'session' || AI_CONFIG.DEMO_MODE) 
        ? queryCache.getResponse(question, queryMode, sessionId) 
        : null;
      if (cachedResponse) {
        console.log(`[Cache] Full response cache hit (${queryMode} mode)`);
        return res.json({ ...cachedResponse, _cacheHit: true });
      }

      // Analyze question structure upfront
      const questionStructure = analyzeQuestionStructure(question);
      console.log("[RAG] Question analysis", {
        questionPreview: question.slice(0, 80),
        ...questionStructure,
      });

      // 1. Try local RAG first (if we have local vectors)
      let embedding: number[] = [];
      let vectorStore = getVectorStore();
      
      if (queryMode === 'session' && sessionId) {
        vectorStore = vectorStore.filter(doc => doc.metadata?.sessionId === sessionId);
      } else {
        vectorStore = vectorStore.filter(doc => !doc.metadata?.sessionId);
      }
      
      if (queryMode === 'session' && vectorStore.length === 0) {
        return res.json({
          answer: "You haven't uploaded your resume for this session yet. Please paste your resume text in the 'Ingest document' section above and click 'Ingest' so I can analyze it for you.",
          sources: [],
        });
      }
      
      let embeddingCacheHit = false;
      if (vectorStore.length > 0) {
        try {
          const cachedEmbedding = queryCache.getEmbedding(question);
          if (cachedEmbedding) {
            embedding = cachedEmbedding;
            embeddingCacheHit = true;
          } else {
            embedding = await getEmbedding(ai, question);
            queryCache.setEmbedding(question, embedding);
          }
        } catch (embedErr) {
          console.error("[RAG] Query embedding failed, falling back to web search", embedErr);
          const fallbackResponse = await performUncertaintyFallback(ai, question, [], 0, questionStructure, false, queryMode, sessionId);
          return res.json(fallbackResponse);
        }
      }

      const results = vectorStore.length > 0
        ? vectorStore
            .map((doc) => ({
              ...doc,
              similarity: cosineSimilarity(embedding, doc.embedding),
            }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 3)
        : [];

      const relevanceScore = getQuestionRelevanceScore(embedding, vectorStore);
      const isHybridSearch = questionStructure.isAdviceQuestion || questionStructure.isComplex;

      console.log("[RAG] Query State:", {
        queryMode,
        sessionId: sessionId?.slice(0, 10),
        vectorStoreSize: vectorStore.length,
        resultsCount: results.length,
        relevanceScore: relevanceScore.toFixed(4),
        isHybridSearch,
        isAdvice: questionStructure.isAdviceQuestion,
        isComplex: questionStructure.isComplex
      });

      // QUOTA SAVER: If relevance is extremely low, skip the local AI call.
      if (relevanceScore < 0.1 && !isHybridSearch) {
        console.log("[RAG] Quota Saver: Skipping local AI call (relevance too low)", { relevanceScore });
        const fallbackResponse = await performUncertaintyFallback(ai, question, results, relevanceScore, questionStructure, embeddingCacheHit, queryMode, sessionId);
        return res.json(fallbackResponse);
      }

      // Hybrid or Low Confidence Path
      // We only fallback to web search immediately if no relevant documents were found.
      // Otherwise, we always attempt a grounded RAG answer first. 
      // If that answer is uncertain, the system will naturally fall back to web search later.
      const shouldFallbackImmediately = results.length === 0;

      if (shouldFallbackImmediately) {
        const fallbackResponse = await performUncertaintyFallback(ai, question, results, relevanceScore, questionStructure, embeddingCacheHit, queryMode, sessionId);
        return res.json(fallbackResponse);
      }

      // Standard RAG Path
      const context = formatLocalContext(results);
      const sources = results.map((r) => r.content.substring(0, 50) + "...");
      const prompt = `You are a helpful assistant. Answer based ONLY on the following context. If unknown, say you don't know.\n\nContext:\n${context}\n\nQuestion: ${question}`;
      const answer = await getAnswer(ai, prompt);
      
      if (isUncertainAnswer(answer)) {
        const fallbackResponse = await performUncertaintyFallback(ai, question, results, relevanceScore, questionStructure, embeddingCacheHit, queryMode, sessionId);
        return res.json(fallbackResponse);
      }

      const successBody = { 
        answer, 
        sources,
        relevanceScore: Number(relevanceScore.toFixed(4)),
        isAdviceQuestion: questionStructure.isAdviceQuestion,
        _cache: { embeddingHit: embeddingCacheHit, webSearchHit: false }
      };

      queryCache.setResponse(question, successBody, queryMode, sessionId);
      if (AI_CONFIG.DEMO_MODE) queryCache.saveToDisk();
      
      return res.json(successBody);
    } catch (error) {
      console.error("Query error:", error);
      res.status(500).json({ message: "Failed to process query" });
    }
  });

  return httpServer;
}
