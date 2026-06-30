import { GoogleGenAI } from "@google/genai";
import type {
  EmbedContentOptions,
  EmbedContentResult,
  GenerateContentOptions,
  GenerateContentResult,
  LLMAdapter,
  LLMModels,
} from "./llmAdapter.ts";
import { toSdkEmbedRequest, toSdkGenerateRequest } from "./geminiSdkBridge.ts";

export interface GeminiConfig {
  useVertex: boolean;
  apiKey?: string;        // For AI Studio
  projectId?: string;    // For Vertex AI
  location?: string;     // For Vertex AI (e.g., 'us-central1')
}

export class GeminiAdapter implements LLMAdapter {
  private client: GoogleGenAI;
  private aiStudioClient?: GoogleGenAI; // Used for 3072-dim embeddings in Hybrid mode
  private useVertex: boolean;

  public models: LLMModels;

  constructor(config: GeminiConfig) {
    this.useVertex = config.useVertex;
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY;

    if (this.useVertex) {
      console.log(`[Adapter] Initializing Vertex AI Adapter via unified SDK (Project: ${config.projectId || "DEFAULT"}, Location: ${config.location || "DEFAULT"})`);
      this.client = new GoogleGenAI({
        vertexai: true,
        project: config.projectId || process.env.GCP_PROJECT_ID,
        location: config.location || process.env.GCP_LOCATION || "us-central1",
      });

      // Hybrid Fallback: Initialize AI Studio client for 3072-dim embeddings if API key is present
      if (apiKey) {
        console.log("[Adapter] Hybrid Mode: Initializing parallel AI Studio client for 3072-dim embeddings");
        this.aiStudioClient = new GoogleGenAI({ apiKey });
      }
    } else {
      console.log("[Adapter] Initializing AI Studio Adapter via unified SDK");
      if (!apiKey) {
        throw new Error("API Key required for AI Studio track. Set GEMINI_API_KEY env variable.");
      }
      this.client = new GoogleGenAI({ apiKey });
      this.aiStudioClient = this.client;
    }

    this.models = {
      generateContent: this.generateContent.bind(this),
      embedContent: this.embedContent.bind(this),
      list: async () => {
        return await this.client.models.list();
      }
    };
  }

  async generateContent(options: GenerateContentOptions): Promise<GenerateContentResult> {
    const modelName = this.resolveGenerateModelName(options.model);
    const response = await this.client.models.generateContent(
      toSdkGenerateRequest(modelName, options),
    );
    return response as GenerateContentResult;
  }

  async embedContent(options: EmbedContentOptions): Promise<EmbedContentResult> {
    // Vertex text embeddings cap at 768 dims; route to AI Studio when hybrid client exists.
    if (this.useVertex && this.aiStudioClient) {
      console.log(`[Adapter] Hybrid Routing: Routing embedding call to AI Studio (${options.model}) to preserve 3072-dim DB schema`);
      const modelName = this.withModelsPrefix(options.model);
      const response = await this.aiStudioClient.models.embedContent(
        toSdkEmbedRequest(modelName, options),
      );
      return response as EmbedContentResult;
    }

    const modelName = this.resolveEmbedModelName(options.model);
    const response = await this.client.models.embedContent(
      toSdkEmbedRequest(modelName, options, {
        ...options.config,
        outputDimensionality: 3072,
      }),
    );
    return response as EmbedContentResult;
  }

  private resolveGenerateModelName(model: string): string {
    if (this.useVertex) {
      const clean = model.replace(/^models\//, "");
      let mapped = clean;
      if (clean.includes("lite")) mapped = "gemini-2.5-flash-lite";
      else if (clean.includes("flash")) mapped = "gemini-2.5-flash";
      else if (clean.includes("pro")) mapped = "gemini-2.5-pro";
      console.log(`[Adapter] Vertex AI generateContent using model: ${mapped} (original: ${model})`);
      return mapped;
    }
    return this.withModelsPrefix(model);
  }

  private resolveEmbedModelName(model: string): string {
    if (this.useVertex) {
      const stripped = model.replace(/^models\//, "");
      console.log(`[Adapter] Vertex AI embedContent using model: ${stripped}`);
      return stripped;
    }
    return this.withModelsPrefix(model);
  }

  private withModelsPrefix(model: string): string {
    if (model.startsWith("models/") || model.startsWith("tunedModels/")) {
      return model;
    }
    return `models/${model}`;
  }
}
