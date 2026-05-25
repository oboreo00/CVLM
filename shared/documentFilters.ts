import { isSearchableDocument } from "./resumeTypes";

export interface FilterableDoc {
  embedding: number[];
  metadata?: Record<string, unknown> | null;
}

/** Returns chunk rows eligible for vector search (excludes manifests, enforces core/session scope). */
export function filterSearchableDocs(
  docs: FilterableDoc[],
  queryMode: "core" | "session",
  userId?: string,
): FilterableDoc[] {
  return docs.filter((doc) => {
    const meta = doc.metadata ?? {};
    if (!isSearchableDocument(meta)) return false;
    if (!doc.embedding || doc.embedding.length === 0) return false;

    if (queryMode === "session" && userId) {
      return meta.userId === userId;
    }
    return !meta.userId;
  });
}

export function isCorePrepReady(
  docs: Array<{ userId: string | null; metadata: unknown }>,
  source: string,
  hash: string,
  coreManifestType: string,
): boolean {
  const manifest = docs.find(
    (doc) =>
      !doc.userId &&
      (doc.metadata as Record<string, unknown> | null)?.type === coreManifestType &&
      (doc.metadata as Record<string, unknown> | null)?.source === source,
  );
  if (!manifest?.metadata) return false;
  const meta = manifest.metadata as Record<string, unknown>;
  return meta.hash === hash && meta.prepStatus === "ready";
}
