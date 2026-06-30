import { withGeminiRetries } from "./geminiClient";
import { AI_MODELS } from "./aiConfig";
import type { LLMAdapter } from "./llmAdapter";

export interface WebSearchItem {
  title: string;
  snippet: string;
  link: string;
}

export type WebSearchProvider = 'gemini' | 'anthropic';

/**
 * Searches the web using the specified provider
 * Returns structured web results with title, snippet, and link
 */
export async function searchWeb(ai: LLMAdapter, query: string, provider: WebSearchProvider = 'gemini'): Promise<WebSearchItem[]> {
  console.log("[RAG] searchWeb called", {
    queryPreview: query.slice(0, 80),
    provider,
  });

  if (provider === 'gemini') {
    return searchWebGemini(ai, query);
  } else if (provider === 'anthropic') {
    return searchWebAnthropic(query);
  }

  return [];
}

async function searchWebGemini(ai: LLMAdapter, query: string): Promise<WebSearchItem[]> {
  if (!ai) return [];

  // Use the verified model from our central config
  const model = AI_MODELS.FAST_WORKHORSE;

  try {
    const fetchWithRetry = async () => {
      return await ai.models.generateContent({
        model: model,
        contents: query,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
    };

    // Apply the same retry logic as the rest of the app
    const data = await withGeminiRetries(`Gemini Web Search (${model})`, fetchWithRetry);
    
    if (!data || !data.candidates) return [];
    
    const chunks: any[] = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

    const answerText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (chunks.length === 0 && !answerText) return [];

    if (chunks.length === 0 && answerText) {
      return [{ title: "Gemini Web Search", snippet: answerText, link: "" }];
    }

    // Map grounding chunks to WebSearchItem shape, placing the full synthesized answer into the first snippet
    return chunks.map((chunk: any, i: number) => ({
      title: chunk.web?.title ?? "Untitled",
      snippet: i === 0 && answerText ? answerText : (chunk.web?.title ?? "Web source result"),
      link: chunk.web?.uri ?? "",
    }));
  } catch (e) {
    console.log("[RAG Demo] Gemini web search error:", e);
    return [];
  }
}

async function searchWebAnthropic(query: string): Promise<WebSearchItem[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log("[RAG Demo] Missing ANTHROPIC_API_KEY");
    return [];
  }

  // TODO: Implement Anthropic web search using Claude's tools and an external search API (e.g., Tavily, Brave)
  console.log("[RAG Demo] Anthropic web search is not yet implemented.");
  return [];
}
