import type { ChunkIndexInfo, PrepStatus, ResumeBrief, ResumeProfile } from "@shared/resumeTypes";

export type PrepStatusResponse = PrepStatus | "none";

export interface PrepStatusPayload {
  prepStatus: PrepStatusResponse;
  profile?: ResumeProfile;
  brief?: ResumeBrief;
  chunkIndex?: ChunkIndexInfo;
  prepError?: string;
}

export function getManifestPayload(manifest: { metadata: unknown } | null): PrepStatusPayload {
  if (!manifest?.metadata || typeof manifest.metadata !== "object") {
    return { prepStatus: "none" };
  }
  const meta = manifest.metadata as Record<string, unknown>;
  const chunkIndexRaw = meta.chunkIndex;
  const chunkIndex =
    chunkIndexRaw &&
    typeof chunkIndexRaw === "object" &&
    typeof (chunkIndexRaw as ChunkIndexInfo).count === "number"
      ? (chunkIndexRaw as ChunkIndexInfo)
      : undefined;

  return {
    prepStatus: (meta.prepStatus as PrepStatus) ?? "none",
    profile: meta.profile as ResumeProfile | undefined,
    brief: meta.brief as ResumeBrief | undefined,
    chunkIndex,
    prepError: typeof meta.prepError === "string" ? meta.prepError : undefined,
  };
}
