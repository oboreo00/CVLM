/**
 * Maps provider-agnostic LLM options to @google/genai request shapes.
 * Casts are isolated here at the Gemini SDK boundary.
 */
import type {
  EmbedContentParameters,
  GenerateContentParameters,
} from "@google/genai";
import type { EmbedContentOptions, GenerateContentOptions } from "./llmAdapter.ts";

export function toSdkGenerateRequest(
  model: string,
  options: GenerateContentOptions,
): GenerateContentParameters {
  return {
    model,
    contents: options.contents,
    config: options.config,
  } as GenerateContentParameters;
}

export function toSdkEmbedRequest(
  model: string,
  options: EmbedContentOptions,
  config?: EmbedContentParameters["config"],
): EmbedContentParameters {
  return {
    model,
    contents: options.contents,
    config: config ?? options.config,
  } as EmbedContentParameters;
}
