import { withGeminiRetries } from "./geminiClient";
import { AI_MODELS } from "./aiConfig";

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
export async function searchWeb(query: string, provider: WebSearchProvider = 'gemini'): Promise<WebSearchItem[]> {
  console.log("[RAG] searchWeb called", {
    queryPreview: query.slice(0, 80),
    provider,
  });

  if (provider === 'gemini') {
    return searchWebGemini(query);
  } else if (provider === 'anthropic') {
    return searchWebAnthropic(query);
  }

  return [];
}

async function searchWebGemini(query: string): Promise<WebSearchItem[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];

  // Use the verified model from our central config
  const model = AI_MODELS.FAST_WORKHORSE;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  try {
    const fetchWithRetry = async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: query }] }],
          tools: [{ google_search: {} }],
        }),
      });

      if (response.status === 429 || response.status === 503) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData?.error?.message || "";
        if (message.toLowerCase().includes("quota") || message.toLowerCase().includes("limit")) {
          throw new Error(`QUOTA_EXCEEDED: ${message}`);
        }
        throw new Error(`RETRY_REQUIRED: ${response.status}`);
      }

      if (!response.ok) {
        console.log(`[RAG Demo] Gemini web search failed: ${response.status} ${response.statusText}`);
        return [];
      }
      return response.json();
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
