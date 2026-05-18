import { GoogleGenAI } from "@google/genai";

export interface GeminiConfig {
  useVertex: boolean;
  apiKey?: string;        // For AI Studio
  projectId?: string;    // For Vertex AI
  location?: string;     // For Vertex AI (e.g., 'us-central1')
}

export class GeminiAdapter {
  private client: GoogleGenAI;
  private aiStudioClient?: GoogleGenAI; // Used for 3072-dim embeddings in Hybrid mode
  private useVertex: boolean;

  public models: {
    generateContent: (options: {
      model: string;
      contents: any;
      config?: {
        tools?: any[];
        [key: string]: any;
      };
    }) => Promise<any>;
    embedContent: (options: {
      model: string;
      contents: any;
      config?: {
        taskType?: string;
        [key: string]: any;
      };
    }) => Promise<any>;
    list: () => Promise<any>;
  };

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

    // Bind methods to the models property to act as a drop-in replacement for GoogleGenAI SDK structure
    this.models = {
      generateContent: this.generateContent.bind(this),
      embedContent: this.embedContent.bind(this),
      list: async () => {
        return await this.client.models.list();
      }
    };
  }

  /**
   * Unified generate content method that standardizes the response object and maps models
   */
  async generateContent(options: {
    model: string;
    contents: any;
    config?: {
      tools?: any[];
      [key: string]: any;
    };
  }): Promise<any> {
    let modelName = options.model;

    if (this.useVertex) {
      // Map to standard Vertex AI production models (Gemini 2.5 is the production default in 2026)
      const clean = modelName.replace(/^models\//, "");
      if (clean.includes("flash") || clean.includes("lite")) {
        modelName = "gemini-2.5-flash";
      } else if (clean.includes("pro")) {
        modelName = "gemini-2.5-pro";
      } else {
        modelName = clean; // allow specific models to pass through
      }
      console.log(`[Adapter] Vertex AI generateContent using model: ${modelName} (original: ${options.model})`);
    } else {
      // Ensure model name has "models/" prefix if not already present (AI Studio requires it)
      if (!modelName.startsWith("models/") && !modelName.startsWith("tunedModels/")) {
        modelName = `models/${modelName}`;
      }
    }

    return await this.client.models.generateContent({
      model: modelName,
      contents: options.contents,
      config: options.config,
    });
  }

  /**
   * Unified embed content method that maps embedding models and safeguards dimension output
   */
  async embedContent(options: {
    model: string;
    contents: any;
    config?: {
      taskType?: string;
      [key: string]: any;
    };
  }): Promise<any> {
    // If Vertex is active, but we have an AI Studio client, route the embedding call to AI Studio.
    // This is because Vertex AI's text-embedding models (004/005) only support a maximum of 768 dimensions,
    // which causes pgvector insertion to fail since your database schema strictly expects 3072 dimensions.
    if (this.useVertex && this.aiStudioClient) {
      console.log(`[Adapter] Hybrid Routing: Routing embedding call to AI Studio (${options.model}) to preserve 3072-dim DB schema`);
      let modelName = options.model;
      if (!modelName.startsWith("models/")) {
        modelName = `models/${modelName}`;
      }
      return await this.aiStudioClient.models.embedContent({
        model: modelName,
        contents: options.contents,
        config: options.config,
      });
    }

    // Fallback: execute on the primary client
    let modelName = options.model;
    if (this.useVertex) {
      modelName = modelName.replace(/^models\//, "");
      console.log(`[Adapter] Vertex AI embedContent using model: ${modelName}`);
    } else {
      if (!modelName.startsWith("models/")) {
        modelName = `models/${modelName}`;
      }
    }

    return await this.client.models.embedContent({
      model: modelName,
      contents: options.contents,
      config: {
        ...options.config,
        outputDimensionality: 3072 // Force 3072 dimensions if supported
      }
    });
  }
}
