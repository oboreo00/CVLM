import { describe, expect, it } from "vitest";
import { DOC_TYPES } from "@shared/resumeTypes";
import { filterSearchableDocs, isCorePrepReady } from "@shared/documentFilters";

const EMBEDDING = [1, 0, 0];

describe("documentFilters", () => {
  describe("filterSearchableDocs", () => {
    const coreChunk = {
      embedding: EMBEDDING,
      metadata: { type: DOC_TYPES.CHUNK, userId: undefined },
    };
    const coreManifest = {
      embedding: [],
      metadata: { type: DOC_TYPES.CORE_MANIFEST },
    };
    const userAChunk = {
      embedding: EMBEDDING,
      metadata: { type: DOC_TYPES.CHUNK, userId: "user-a" },
    };
    const userBChunk = {
      embedding: EMBEDDING,
      metadata: { type: DOC_TYPES.CHUNK, userId: "user-b" },
    };

    it("returns only core chunks in core mode", () => {
      const result = filterSearchableDocs(
        [coreChunk, coreManifest, userAChunk],
        "core",
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(coreChunk);
    });

    it("returns only matching session chunks in session mode", () => {
      const result = filterSearchableDocs(
        [coreChunk, userAChunk, userBChunk],
        "session",
        "user-a",
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(userAChunk);
    });

    it("excludes manifests and rows without embeddings", () => {
      const noEmbedding = {
        embedding: [],
        metadata: { type: DOC_TYPES.CHUNK },
      };
      const result = filterSearchableDocs(
        [coreChunk, coreManifest, noEmbedding],
        "core",
      );
      expect(result).toHaveLength(1);
    });
  });

  describe("isCorePrepReady", () => {
    it("returns true when manifest hash matches and status is ready", () => {
      const docs = [
        {
          userId: null,
          metadata: {
            type: DOC_TYPES.CORE_MANIFEST,
            source: "resume.txt",
            hash: "abc123",
            prepStatus: "ready",
          },
        },
      ];
      expect(isCorePrepReady(docs, "resume.txt", "abc123", DOC_TYPES.CORE_MANIFEST)).toBe(true);
    });

    it("returns false when hash differs or prep is not ready", () => {
      const docs = [
        {
          userId: null,
          metadata: {
            type: DOC_TYPES.CORE_MANIFEST,
            source: "resume.txt",
            hash: "old-hash",
            prepStatus: "ready",
          },
        },
      ];
      expect(isCorePrepReady(docs, "resume.txt", "new-hash", DOC_TYPES.CORE_MANIFEST)).toBe(false);

      const pending = [
        {
          userId: null,
          metadata: {
            type: DOC_TYPES.CORE_MANIFEST,
            source: "resume.txt",
            hash: "abc123",
            prepStatus: "pending",
          },
        },
      ];
      expect(isCorePrepReady(pending, "resume.txt", "abc123", DOC_TYPES.CORE_MANIFEST)).toBe(false);
    });
  });
});
