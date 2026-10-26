/**
 * Centralized AI Model Configuration
 * Manage all model versions and fallback lists here.
 */

export const AI_MODELS = {
  // The primary models used for final answer synthesis
  DEFAULT_ANSWERING_FALLBACKS: [
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-flash-latest"
  ],
  
  // Faster, cheapest model for background orchestration tasks
  FAST_WORKHORSE: "gemini-3.5-flash-lite",
  
  // Standard embedding model
  EMBEDDING: "gemini-embedding-2"
};

export const AI_CONFIG = {
  // Confidence thresholds for RAG routing
  THRESHOLDS: {
    PERSONAL: 0.55,
    CORE: 0.75
  },
  // Set to true to persist successful AI answers to disk for future recruiter demos
  DEMO_MODE: true
};
