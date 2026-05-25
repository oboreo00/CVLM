export const DOC_TYPES = {
  CORE_MANIFEST: "core_manifest",
  SESSION_MANIFEST: "session_manifest",
  CHUNK: "chunk",
} as const;

export type DocType = (typeof DOC_TYPES)[keyof typeof DOC_TYPES];

export type PrepStatus = "pending" | "ready" | "failed";

export interface ResumeProfile {
  name?: string | null;
  title?: string | null;
  location?: string | null;
  seniority?: string | null;
  yearsExperience?: number | null;
  skills?: {
    languages?: string[];
    frameworks?: string[];
    domains?: string[];
  };
  highlights?: string[];
}

export interface ResumeBrief {
  summary: string;
  proofPoints: string[];
  starterQuestions: string[];
}

export interface ResumeChunk {
  content: string;
  section: string;
  company?: string | null;
  chunkIndex: number;
}

export interface PrepResult {
  chunks: ResumeChunk[];
  profile: ResumeProfile;
  brief: ResumeBrief;
}

/** Stored on manifest after prep — surfaced in UI as RAG index feedback. */
export interface ChunkIndexInfo {
  count: number;
  sections: string[];
}

export interface ManifestMetadata {
  type: DocType;
  prepStatus: PrepStatus;
  prepId?: string;
  profile?: ResumeProfile;
  brief?: ResumeBrief;
  chunkIndex?: ChunkIndexInfo;
  source?: string;
  hash?: string;
  userId?: string;
  expiresAt?: number;
  prepError?: string;
}

export function isManifestType(type: unknown): boolean {
  return type === DOC_TYPES.CORE_MANIFEST || type === DOC_TYPES.SESSION_MANIFEST;
}

export function isSearchableDocument(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return true;
  const type = metadata.type;
  if (isManifestType(type)) return false;
  return true;
}
