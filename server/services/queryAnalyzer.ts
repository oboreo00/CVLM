/**
 * Query analysis service
 * Analyzes question complexity, relevance, and suggests decomposition
 */

import { performance } from "perf_hooks";
import { withGeminiRetries, getAnswer, isUncertainAnswer } from "./geminiClient.ts";
import { AI_MODELS, AI_CONFIG } from "./aiConfig.ts";
import { QUERY_ROUTES } from "@shared/queryRoutes";
import { queryCache } from "./cacheService.ts";
import { searchWeb } from "./webSearch.ts";

import {
  heuristicQuestionStructure,
  type QuestionStructure,
} from "./queryIntentClassifier.ts";

export type { QuestionStructure } from "./queryIntentClassifier.ts";

interface VectorDoc {
  id: number;
  content: string;
  embedding: number[];
}

export interface DocumentMetadata {
  name?: string;
  title?: string;
  location?: string;
  [key: string]: any;
}

/**
 * Sync heuristic intent (fallback). Prefer classifyQueryIntent() in routes.
 */
export function analyzeQuestionStructure(question: string): QuestionStructure {
  return heuristicQuestionStructure(question);
}

/**
 * Helper to calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (magA * magB);
}

/**
 * Computes a relevance score (0–1) for a question against the vector store.
 *
 * Algorithm:
 *  1. Calculates cosine similarity between the question embedding and every
 *     document embedding, then keeps only the top-K most similar documents
 *     (default K = 5).
 *  2. Derives two metrics from the top-K set:
 *     - **maxSimilarity** – the single highest cosine similarity (best match).
 *     - **avgSimilarity** – the mean cosine similarity across the top-K docs.
 *  3. Returns a weighted blend: `maxSimilarity * 0.6 + avgSimilarity * 0.4`.
 *     The 60/40 weighting favors the best individual match while still
 *     rewarding broad coverage across multiple relevant documents.
 *
 * @param questionEmbedding - Embedding vector of the user's question.
 * @param documents         - All documents in the vector store to compare against.
 * @param topK              - Number of top matches to consider (default 5).
 * @returns A score between 0 and 1, where higher means more relevant.
 */
export function getQuestionRelevanceScore(
  questionEmbedding: number[],
  documents: VectorDoc[],
  topK: number = 5
): number {
  if (documents.length === 0) return 0;
  
  const similarities = documents
    .map(doc => cosineSimilarity(questionEmbedding, doc.embedding))
    .sort((a, b) => b - a)
    .slice(0, topK);
  
  if (similarities.length === 0) return 0;
  
  // Average of top-K similarities, weighted towards higher matches
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const maxSimilarity = similarities[0];
  
  // Return weighted score: 60% max, 40% average
  return maxSimilarity * 0.6 + avgSimilarity * 0.4;
}

/**
 * Generates sub-questions for complex queries
 * Returns suggested breakdown for multi-part questions
 */
export async function suggestQuestionBreakdown(
  ai: any,
  question: string,
  structure: QuestionStructure
): Promise<{ questions: string[], usage: any }> {
  if (structure.estimatedSubQuestions <= 1) {
    return { questions: [], usage: null };
  }
  
  const prompt = `Break down this complex question into ${structure.estimatedSubQuestions} simpler, focused questions that address different aspects. Return ONLY the questions, one per line, without numbering or explanations.

Question: ${question}`;

  try {
    const response = (await withGeminiRetries("breakdownQuestion", () =>
      ai.models.generateContent({
        model: AI_MODELS.FAST_WORKHORSE,
        contents: prompt,
      }),
    )) as any;
    
    if (!response.candidates?.[0]?.content?.parts?.[0]?.text) return { questions: [], usage: null };
    
    const questions = response.candidates[0].content.parts[0].text
      .split('\n')
      .map((q: string) => q.trim())
      .filter((q: string) => q.length > 5 && q.includes('?'))
      .slice(0, structure.estimatedSubQuestions);

    return { questions, usage: response.usageMetadata };
  } catch (e) {
    console.log("[RAG] Question breakdown failed:", e);
    return { questions: [], usage: null };
  }
}

/**
 * Extracts identity metadata (name, title) from resume text
 */
export async function extractDocumentMetadata(
  ai: any,
  text: string
): Promise<DocumentMetadata> {
  const prompt = `Analyze the following resume text and extract the individual's full name, professional title, and location. 
Return ONLY a JSON object with keys "name", "title", and "location". If a value is unknown, use null.

Resume Text (first 1000 chars):
${text.substring(0, 1000)}`;

  try {
    const response = (await withGeminiRetries("extractMetadata", () =>
      ai.models.generateContent({
        model: AI_MODELS.FAST_WORKHORSE,
        contents: prompt,
      }),
    )) as any; // Cast to any to access the SDK helper properties if needed
    
    const responseText = response.text;
    if (!responseText) return {};
    
    // Clean up potential markdown formatting in response
    const jsonStr = responseText.replace(/```json|```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("[RAG] Metadata extraction failed:", e);
    return {};
  }
}

/**
 * Generates an optimized web search query by incorporating relevant local context.
 */
export async function generateSearchQuery(
  ai: any,
  question: string,
  localContext: string
): Promise<{ query: string, usage: any }> {
  if (!localContext || localContext.trim() === "None" || localContext.trim() === "") {
    return { query: question, usage: null };
  }
  
  const prompt = `You are a search query rewriting assistant. The user asked a question, and we have some context about the user's background. 
Extract key identity markers and constraints from the context (like name, location, seniority, specific technologies, or industry). 

If the user's question uses first-person pronouns like "I", "me", or "my", assume they are referring to the individual described in the User Context. Rewrite the question into a single, optimized Google search query that replaces those pronouns with the specific name and details found in the context.

Do not answer the question. Return ONLY the optimized search query text without quotes.

User Context:
${localContext}

Original Question:
${question}

Current Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` ;

  try {
    const response = (await withGeminiRetries("rewriteSearchQuery", () =>
      ai.models.generateContent({
        model: AI_MODELS.FAST_WORKHORSE,
        contents: prompt,
      }),
    )) as any;
    
    const rewritten = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (rewritten) {
      // Clean up the response in case the model adds quotes or newlines
      const cleaned = rewritten.replace(/["\n]/g, '').trim();
      console.log(`[RAG] Rewrote search query: "${question}" -> "${cleaned}"`);
      return { query: cleaned || question, usage: response.usageMetadata };
    }
  } catch (e) {
    console.log("[RAG] Query rewrite failed, falling back to original query:", e);
  }
  return { query: question, usage: null };
}

/**
 * Orchestrates the fallback to web search when local RAG is uncertain.
 * Returns a response body suitable for returning to the client.
 */
export async function performUncertaintyFallback(
  ai: any,
  question: string,
  localResults: any[],
  relevanceScore: number,
  structure: QuestionStructure,
  embeddingCacheHit: boolean,
  queryMode: 'core' | 'session' = 'core',
  sessionId?: string
): Promise<any> {
  const totalStart = performance.now();
  console.log("[RAG] Performing uncertainty fallback", { 
    questionPreview: question.slice(0, 50),
    queryMode,
    sessionId: sessionId ? sessionId.slice(0, 10) + '...' : 'none'
  });
  
  const stepDurations: Record<string, number> = {};
  let promptTokens = 0;
  let completionTokens = 0;

  // 1. Determine if we need fresh suggestions
  let suggestions: string[] = [];
  const suggestAlternatives =
    !structure.isSimpleFactualLookup &&
    (structure.isAdviceQuestion || (structure.isComplex && relevanceScore < 0.5));

  if (suggestAlternatives) {
    const start = performance.now();
    const breakdownResult = await suggestQuestionBreakdown(ai, question, structure);
    suggestions = breakdownResult.questions;
    stepDurations.breakdown = Math.round(performance.now() - start);
    
    promptTokens += breakdownResult.usage?.promptTokenCount || 0;
    completionTokens += breakdownResult.usage?.candidatesTokenCount || 0;
  }

  // 2. Try web search fallback
  const searchStart = performance.now();
  let webResults = queryCache.getWebSearch(question)?.results ?? null;
  let webCacheHit = false;
  
  if (!webResults) {
    const rewriteStart = performance.now();
    const localContextForSearch = formatLocalContext(localResults);
    const rewriteResult = await generateSearchQuery(ai, question, localContextForSearch);
    const optimizedQuery = rewriteResult.query;
    stepDurations.searchRewrite = Math.round(performance.now() - rewriteStart);

    promptTokens += rewriteResult.usage?.promptTokenCount || 0;
    completionTokens += rewriteResult.usage?.candidatesTokenCount || 0;

    const webExecStart = performance.now();
    webResults = await searchWeb(ai, optimizedQuery);
    stepDurations.webExecution = Math.round(performance.now() - webExecStart);

    if (webResults && webResults.length > 0) {
      queryCache.setWebSearch(question, { results: webResults });
    }
  } else {
    webCacheHit = true;
    console.log("[Cache] Web search cache hit (fallback path)");
  }
  stepDurations.totalSearch = Math.round(performance.now() - searchStart);

  // 3. Synthesize final answer (Web + Local)
  if (webResults && webResults.length > 0) {
    const synthesisStart = performance.now();
    const webContext = formatWebContext(webResults);
    const localContext = formatLocalContext(localResults);
    
    // Hybrid Prompt: Uses both sources and acknowledges the context
    const hybridPrompt = `You are a helpful career assistant. I have looked at the user's local RAG context and also searched the web.
    
    Local Context (from user's documents):
    ${localContext}
    
    Web Results (from the internet):
    ${webContext}
    
    Question: ${question}
    
    Instructions:
    1. If the local context contains direct answers (like the person's specific skills or experience), PRIORITIZE it.
    2. Use the web results to supplement, provide general advice, or fill in gaps.
    3. If there is a conflict, state what you found in both sources.
    4. Write a direct, natural answer. You may briefly distinguish resume facts from web information, but do not cite document numbers, chunk labels, or source indices.`;

    const synthesisModel = AI_MODELS.DEFAULT_ANSWERING_FALLBACKS[0];
    const { text: answer, usage: synthesisUsage } = await getAnswer(ai, hybridPrompt, synthesisModel);
    stepDurations.synthesis = Math.round(performance.now() - synthesisStart);

    promptTokens += synthesisUsage?.promptTokenCount || 0;
    completionTokens += synthesisUsage?.candidatesTokenCount || 0;
    
    const responseBody = {
      answer,
      sources: [
        ...(localResults.length > 0 ? ["Custom Resume"] : []),
        ...webResults.map((r) => r.link).filter(Boolean)
      ],
      uncertainty: true,
      isAdviceQuestion: structure.isAdviceQuestion,
      suggestedQuestions: suggestions.length > 0 ? suggestions : undefined,
      hint: suggestions.length > 0
        ? structure.isAdviceQuestion
          ? "This looks like a career-guidance question. Try these focused angles:"
          : "Try these simpler questions instead:"
        : undefined,
      _route: QUERY_ROUTES.HYBRID_WEB_FALLBACK,
      _cache: { embeddingHit: embeddingCacheHit, webSearchHit: webCacheHit },
      telemetry: {
        route: QUERY_ROUTES.HYBRID_WEB_FALLBACK,
        totalDurationMs: Math.round(performance.now() - totalStart),
        stepDurations,
        relevanceScore: parseFloat(relevanceScore.toFixed(3)),
        provider: process.env.USE_VERTEX_AI === "true" ? "GCP Vertex AI" : "Google AI Studio",
        modelsUsed: {
          synthesis: synthesisModel,
          analysis: AI_MODELS.FAST_WORKHORSE,
          embedding: AI_MODELS.EMBEDDING
        },
        cacheStatus: { embeddingHit: embeddingCacheHit, webSearchHit: webCacheHit, responseHit: false },
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        intentLabel: structure.intentLabel,
      }
    };
    
    queryCache.setResponse(question, responseBody, queryMode, sessionId);
    if (AI_CONFIG.DEMO_MODE) queryCache.saveToDisk();
    
    return responseBody;
  }

  // 4. Final failure body if web search also failed
  const finalTelemetry = {
    route: QUERY_ROUTES.WEB_FALLBACK_FAILED,
    totalDurationMs: Math.round(performance.now() - totalStart),
    stepDurations,
    relevanceScore: parseFloat(relevanceScore.toFixed(3)),
    provider: process.env.USE_VERTEX_AI === "true" ? "GCP Vertex AI" : "Google AI Studio",
    modelsUsed: {
      synthesis: "none",
      analysis: AI_MODELS.FAST_WORKHORSE,
      embedding: AI_MODELS.EMBEDDING
    },
    cacheStatus: { embeddingHit: embeddingCacheHit, webSearchHit: webCacheHit, responseHit: false },
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    intentLabel: structure.intentLabel,
  };

  const failureBody = {
    answer: "I could not confidently answer from your RAG library and internet search returned no usable results. Please check Programmable Search scope (entire web) and API key restrictions.",
    sources: [],
    uncertainty: true,
    suggestedQuestions: suggestions.length > 0 ? suggestions : undefined,
    hint: suggestions.length > 0
      ? structure.isAdviceQuestion
        ? "This looks like a career-guidance question. Try these focused angles:"
        : "Try these simpler questions instead:"
      : undefined,
    _route: QUERY_ROUTES.WEB_FALLBACK_FAILED,
    telemetry: finalTelemetry
  };
  
  return failureBody;
}

/**
 * Formats local search results into a context string for synthesis.
 * Uses resume metadata (section, company) — not numeric chunk labels the model might echo.
 */
export function formatLocalContext(results: any[]): string {
  if (results.length === 0) return "None";
  return results
    .map((r) => {
      const parts: string[] = [];
      if (r.metadata?.section) parts.push(String(r.metadata.section));
      if (r.metadata?.company) parts.push(String(r.metadata.company));
      const header = parts.length > 0 ? parts.join(" — ") : null;
      return header ? `${header}\n${r.content}` : r.content;
    })
    .join("\n\n");
}

/**
 * Formats web search results into a context string for synthesis.
 */
export function formatWebContext(results: any[]): string {
  if (!results || results.length === 0) return "None";
  return results
    .map((r) => {
      const title = typeof r.title === "string" && r.title.trim() ? r.title.trim() : "Web result";
      return `${title}\n${r.snippet}`;
    })
    .join("\n\n");
}

/** Shared local-RAG synthesis instructions (routes + replan retry). */
export const LOCAL_RAG_ANSWER_INSTRUCTIONS =
  "You are a helpful assistant. Answer based ONLY on the following context. If the context partially relates to the question, say what is and is not stated. If unknown, say you don't know. Write a direct, natural answer — do not refer to document numbers, chunk labels, or source indices.";

export function buildLocalRagPrompt(context: string, question: string): string {
  return `${LOCAL_RAG_ANSWER_INSTRUCTIONS}\n\nContext:\n${context}\n\nQuestion: ${question}`;
}
