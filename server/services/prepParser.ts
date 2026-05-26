import type { ChunkIndexInfo, PrepResult, ResumeBrief, ResumeChunk, ResumeProfile } from "@shared/resumeTypes";

const SECTION_ORDER = ["summary", "experience", "education", "skills", "projects", "other"];

export function buildChunkIndexSummary(chunks: ResumeChunk[]): ChunkIndexInfo {
  const seen = new Set<string>();
  const sections: string[] = [];
  for (const chunk of chunks) {
    const section = chunk.section || "other";
    if (!seen.has(section)) {
      seen.add(section);
      sections.push(section);
    }
  }
  sections.sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a);
    const ib = SECTION_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return { count: chunks.length, sections };
}

export function fallbackPrep(text: string): PrepResult {
  return {
    chunks: [{ content: text, section: "summary", chunkIndex: 0 }],
    profile: {},
    brief: {
      summary: "Resume indexed as a single document.",
      proofPoints: [],
      starterQuestions: [
        "What is my most recent job title?",
        "Which companies are listed on my resume?",
        "What skills or technologies are mentioned?",
        "What kinds of roles does my experience fit best?",
      ],
    },
  };
}

/** Parses prep-bot JSON (including markdown fences) into a normalized PrepResult. */
export function normalizePrepResult(raw: unknown, text: string): PrepResult {
  if (!raw || typeof raw !== "object") return fallbackPrep(text);

  const data = raw as Record<string, unknown>;
  const chunksRaw = Array.isArray(data.chunks) ? data.chunks : [];
  const chunks: ResumeChunk[] = [];
  for (let i = 0; i < chunksRaw.length; i++) {
    const c = chunksRaw[i];
    if (!c || typeof c !== "object") continue;
    const chunk = c as Record<string, unknown>;
    const content = typeof chunk.content === "string" ? chunk.content.trim() : "";
    if (!content) continue;
    chunks.push({
      content,
      section: typeof chunk.section === "string" ? chunk.section : "other",
      company: typeof chunk.company === "string" ? chunk.company : undefined,
      chunkIndex: typeof chunk.chunkIndex === "number" ? chunk.chunkIndex : i,
    });
  }

  const profile = (data.profile ?? {}) as ResumeProfile;
  const briefRaw = (data.brief ?? {}) as Partial<ResumeBrief>;
  const brief: ResumeBrief = {
    summary: typeof briefRaw.summary === "string" ? briefRaw.summary : "",
    proofPoints: Array.isArray(briefRaw.proofPoints)
      ? briefRaw.proofPoints.filter((p): p is string => typeof p === "string")
      : [],
    starterQuestions: Array.isArray(briefRaw.starterQuestions)
      ? briefRaw.starterQuestions.filter((q): q is string => typeof q === "string")
      : [],
  };

  if (chunks.length === 0) return fallbackPrep(text);
  if (brief.starterQuestions.length === 0) {
    brief.starterQuestions = fallbackPrep(text).brief.starterQuestions;
  }

  return { chunks, profile, brief };
}

export function parsePrepJsonFromModel(text: string): unknown {
  const jsonStr = text.replace(/```json|```/g, "").trim();
  return JSON.parse(jsonStr);
}
