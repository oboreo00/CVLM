import { describe, expect, it } from "vitest";
import {
  DOC_TYPES,
  isManifestType,
  isSearchableDocument,
} from "@shared/resumeTypes";

describe("resumeTypes", () => {
  describe("isManifestType", () => {
    it("recognizes core and session manifest types", () => {
      expect(isManifestType(DOC_TYPES.CORE_MANIFEST)).toBe(true);
      expect(isManifestType(DOC_TYPES.SESSION_MANIFEST)).toBe(true);
    });

    it("rejects chunk and unknown types", () => {
      expect(isManifestType(DOC_TYPES.CHUNK)).toBe(false);
      expect(isManifestType(undefined)).toBe(false);
    });
  });

  describe("isSearchableDocument", () => {
    it("excludes manifest rows from vector search", () => {
      expect(isSearchableDocument({ type: DOC_TYPES.CORE_MANIFEST })).toBe(false);
      expect(isSearchableDocument({ type: DOC_TYPES.SESSION_MANIFEST })).toBe(false);
    });

    it("includes chunks and legacy rows without a type", () => {
      expect(isSearchableDocument({ type: DOC_TYPES.CHUNK })).toBe(true);
      expect(isSearchableDocument({ source: "resume.txt" })).toBe(true);
      expect(isSearchableDocument(null)).toBe(true);
    });
  });
});
