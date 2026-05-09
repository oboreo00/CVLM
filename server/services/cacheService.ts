/**
 * Query & Response Caching Service
 * Session-level LRU cache with tag-based invalidation
 * Optimized for RAG queries, embeddings, and web search results
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export interface CacheEntry<T> {
  value: T;
  tags: Set<string>;
  expiresAt: number;
  hits: number;
  isPersistent?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: string;
}

/**
 * Normalize question for consistent caching
 * Handles case, whitespace, punctuation variations
 */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")           // normalize multiple spaces
    .replace(/[?.!;:,—–-]+$/, "")   // strip trailing punctuation
    .substring(0, 500);             // cap length to prevent huge keys
}

/**
 * Generate SHA-256 hash of normalized question
 * Production-grade hashing to avoid collisions
 */
export function hashQuestion(question: string): string {
  const normalized = normalizeQuestion(question);
  return crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex")
    .substring(0, 16); // Use first 16 chars for brevity
}

/**
 * LRU Cache with TTL and tag-based invalidation
 * Generic cache suitable for any data type
 */
export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private stats = { hits: 0, misses: 0 };
  private readonly maxSize: number;
  private readonly defaultTTL: number;

  constructor(maxSize: number = 1000, defaultTTLms: number = 24 * 60 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTLms;
  }

  /**
   * Export cache to JSON-serializable object
   */
  toJSON(): any[] {
    const data: any[] = [];
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      // Only persist items that haven't expired yet
      if (now > entry.expiresAt) continue;

      data.push({
        key,
        value: entry.value,
        expiresAt: entry.expiresAt,
        tags: Array.from(entry.tags),
        isPersistent: entry.isPersistent
      });
    }
    return data;
  }

  /**
   * Load cache from serializable object
   */
  fromJSON(data: any): void {
    try {
      this.cache.clear();
      if (Array.isArray(data)) {
        // Internal array format
        for (const item of data) {
          this.cache.set(item.key, {
            value: item.value,
            expiresAt: item.expiresAt,
            tags: new Set(item.tags || []),
            hits: 0,
            isPersistent: item.isPersistent
          });
        }
      } else if (typeof data === 'object' && data !== null) {
        // Human-readable object format (for manual seeding)
        for (const [key, val] of Object.entries(data)) {
          const entry = val as any;
          this.cache.set(key, {
            value: entry.value || entry, // Handle simplified structure
            expiresAt: entry.expiresAt || (Date.now() + this.defaultTTL),
            tags: new Set(entry.tags || []),
            hits: 0,
            isPersistent: true
          });
        }
      }
    } catch (e) {
      console.error("[Cache] Failed to load from JSON", e);
    }
  }

  /**
   * Retrieve cached value if exists and not expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Move to end of Map to track "Recent Use"
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Store value with optional TTL override and tags
   * Tags enable bulk invalidation (e.g., clear all entries tagged with 'doc-123')
   */
  set(key: string, value: T, ttlMs?: number, tags: string[] = []): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Map keys iteration order is insertion order; first key is oldest
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      tags: new Set(tags),
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
      hits: 0,
    });
  }

  /**
   * Invalidate all entries tagged with a specific tag
   * Useful for clearing related caches (e.g., when new doc is ingested)
   */
  invalidateTag(tag: string): number {
    let invalidated = 0;
    for (const [key, entry] of this.cache) {
      if (entry.tags.has(tag)) {
        this.cache.delete(key);
        invalidated++;
      }
    }
    return invalidated;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses || 1;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate: `${((this.stats.hits / total) * 100).toFixed(1)}%`,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }
}

/**
 * Specialized query cache with different TTLs by question type
 * Shorter TTL for advice/personal questions that change more frequently
 */
export class QueryCache {
  private embeddingCache = new LRUCache<number[]>(500, 24 * 60 * 60 * 1000); // 24h
  private responseCache = new LRUCache<ResponseCacheEntry>(300, 24 * 60 * 60 * 1000); // 24h
  private webSearchCache = new LRUCache<WebSearchCacheEntry>(200, 6 * 60 * 60 * 1000); // 6h
  private readonly PERSISTENT_PATH = "knowledge/persistent_cache.json";

  constructor() {}

  /**
   * Persist current cache to disk
   */
  saveToDisk(): void {
    try {
      const data = {
        embeddings: this.embeddingCache.toJSON(),
        responses: this.responseCache.toJSON(),
        webSearches: this.webSearchCache.toJSON()
      };
      const dir = path.dirname(this.PERSISTENT_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.PERSISTENT_PATH, JSON.stringify(data, null, 2));
      console.log(`[Cache] Persisted to ${this.PERSISTENT_PATH}`);
    } catch (e) {
      console.error("[Cache] Failed to save to disk", e);
    }
  }

  /**
   * Load cache from disk
   */
  loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.PERSISTENT_PATH)) return;
      const data = JSON.parse(fs.readFileSync(this.PERSISTENT_PATH, 'utf-8'));
      if (data.embeddings) this.embeddingCache.fromJSON(data.embeddings);
      if (data.responses) this.responseCache.fromJSON(data.responses);
      if (data.webSearches) this.webSearchCache.fromJSON(data.webSearches);
      console.log(`[Cache] Loaded from ${this.PERSISTENT_PATH}. Sizes:`, {
        embeddings: this.embeddingCache.getStats().size,
        responses: this.responseCache.getStats().size,
        webSearches: this.webSearchCache.getStats().size
      });
    } catch (e) {
      console.error("[Cache] Failed to load from disk", e);
    }
  }

  /**
   * Get or null for embedding
   */
  getEmbedding(question: string): number[] | null {
    const key = normalizeQuestion(question);
    return this.embeddingCache.get(key);
  }

  setEmbedding(question: string, embedding: number[]): void {
    const key = normalizeQuestion(question);
    this.embeddingCache.set(key, embedding, undefined, ["embedding"]);
  }

  /**
   * Get cached response with mode awareness
   */
  getResponse(question: string, mode: 'core' | 'session' = 'core', sessionId?: string): ResponseCacheEntry | null {
    const questionKey = normalizeQuestion(question);
    
    // Safety: if mode is session, we MUST have a sessionId
    if (mode === 'session' && !sessionId) {
      return null;
    }

    const key = mode === 'session' 
      ? `session:${sessionId}:${questionKey}` 
      : `core:${questionKey}`;
      
    return this.responseCache.get(key);
  }

  /**
   * Store response with TTL and mode awareness.
   * TTL is derived from response.isAdviceQuestion (2 h for advice, 24 h otherwise).
   */
  setResponse(
    question: string,
    response: ResponseCacheEntry,
    mode: 'core' | 'session' = 'core',
    sessionId?: string
  ): void {
    const questionKey = normalizeQuestion(question);
    
    // Safety: if mode is session, we MUST have a sessionId
    if (mode === 'session' && !sessionId) {
      return;
    }

    const key = mode === 'session' 
      ? `session:${sessionId}:${questionKey}` 
      : `core:${questionKey}`;

    const ttl = response.isAdviceQuestion 
      ? 2 * 60 * 60 * 1000  // 2 hours for advice
      : 24 * 60 * 60 * 1000; // 24 hours for general knowledge
      
    this.responseCache.set(key, response, ttl, ["response", `mode-${mode}`, sessionId ? `session-${sessionId}` : "no-session"]);
  }

  /**
   * Get cached web search results
   */
  getWebSearch(query: string): WebSearchCacheEntry | null {
    const key = normalizeQuestion(query);
    return this.webSearchCache.get(key);
  }

  setWebSearch(query: string, results: WebSearchCacheEntry): void {
    const key = normalizeQuestion(query);
    const ttl = 6 * 60 * 60 * 1000; // 6 hours - web results change
    this.webSearchCache.set(key, results, ttl, ["websearch"]);
  }

  /**
   * Invalidate all caches by tag
   * Called when new document is ingested
   */
  invalidateOnDocumentIngest(docId: number): void {
    const docTag = `doc-${docId}`;
    const embeddingCount = this.embeddingCache.invalidateTag(docTag);
    const responseCount = this.responseCache.invalidateTag(docTag);
    const webSearchCount = this.webSearchCache.invalidateTag(docTag);

    console.log("[Cache] Invalidated on document ingest", {
      docId,
      embeddingsCleaned: embeddingCount,
      responsesCleaned: responseCount,
      webSearchesCleaned: webSearchCount,
    });
  }

  /**
   * Invalidate all responses for a specific session
   * Called when a user uploads a new resume to ensure fresh analysis
   */
  invalidateSessionCache(sessionId: string): number {
    if (!sessionId) return 0;
    const sessionTag = `session-${sessionId}`;
    const count = this.responseCache.invalidateTag(sessionTag);
    console.log(`[Cache] Invalidated ${count} entries for session ${sessionId}`);
    return count;
  }

  /**
   * Full cache clear (nuclear option)
   */
  clearAll(): void {
    this.embeddingCache.clear();
    this.responseCache.clear();
    this.webSearchCache.clear();
    console.log("[Cache] All caches cleared");
  }

  /**
   * Get combined statistics
   */
  getStats(): { embedding: CacheStats; response: CacheStats; webSearch: CacheStats } {
    return {
      embedding: this.embeddingCache.getStats(),
      response: this.responseCache.getStats(),
      webSearch: this.webSearchCache.getStats(),
    };
  }

  /**
   * Reset all statistics
   */
  resetStats(): void {
    this.embeddingCache.resetStats();
    this.responseCache.resetStats();
    this.webSearchCache.resetStats();
  }
}

/**
 * Response cache entry structure
 */
export interface ResponseCacheEntry {
  answer: string;
  sources: string[];
  relevanceScore?: number;
  /** When true, cache TTL is shortened to 2 h (vs 24 h for general knowledge). */
  isAdviceQuestion?: boolean;
  suggestedQuestions?: string[];
  hint?: string;
  metadata?: Record<string, any>;
}

/**
 * Web search cache entry structure
 */
export interface WebSearchCacheEntry {
  results: Array<{ title: string; snippet: string; link: string }>;
}

// Singleton instance
export const queryCache = new QueryCache();
