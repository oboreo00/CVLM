/**
 * Minimal LLM adapter contract for CVLM orchestration (generate, embed, list).
 *
 * GeminiAdapter implements this today. A future AnthropicAdapter would need to
 * map Claude message APIs into generateContent and either stub embedContent or
 * delegate embeddings to a separate provider (pgvector expects 3072-dim Gemini embeddings).
 */

/** Token usage; Gemini-native field names — normalize in non-Gemini adapters. */
export interface LLMUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GenerateContentOptions {
  model: string;
  contents: string | unknown;
  config?: {
    tools?: unknown[];
    [key: string]: unknown;
  };
}

export interface GenerateContentResult {
  text?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { title?: string; uri?: string };
      }>;
    };
  }>;
  usageMetadata?: LLMUsageMetadata;
}

export interface EmbedContentOptions {
  model: string;
  contents: string | unknown[] | unknown;
  config?: {
    taskType?: string;
    outputDimensionality?: number;
    [key: string]: unknown;
  };
}

export interface EmbedContentResult {
  embeddings?: Array<{ values: number[] }>;
}

export interface LLMModels {
  generateContent(options: GenerateContentOptions): Promise<GenerateContentResult>;
  embedContent(options: EmbedContentOptions): Promise<EmbedContentResult>;
  list(): Promise<unknown>;
}

export interface LLMAdapter {
  models: LLMModels;
}
