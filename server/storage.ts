import { eq, sql, isNull, and } from "drizzle-orm";
import { db } from "./db";
import { documents, queryLogs, type InsertDocument, type Document } from "@shared/schema";
import { DOC_TYPES, type PrepStatus } from "@shared/resumeTypes";

export interface IStorage {
  createDocument(doc: InsertDocument): Promise<Document>;
  getDocuments(): Promise<Document[]>;
  addDocuments(docs: InsertDocument[]): Promise<Document[]>;
  deleteExpiredSessions(): Promise<void>;
  deleteUserDocuments(userId: string): Promise<void>;
  deleteCoreDocumentsBySource(source: string): Promise<void>;
  getManifest(userId: string | null): Promise<Document | null>;
  getCoreManifest(): Promise<Document | null>;
  updateManifestPrepStatus(
    userId: string,
    status: PrepStatus,
    prepId: string,
    error?: string,
  ): Promise<void>;
  insertQueryLog(log: any): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createDocument(doc: InsertDocument): Promise<Document> {
    const [document] = await db.insert(documents).values(doc).returning();
    return document;
  }

  async getDocuments(): Promise<Document[]> {
    return await db.select().from(documents);
  }

  async addDocuments(docs: InsertDocument[]): Promise<Document[]> {
    const inserted = await db.insert(documents).values(docs).returning();
    return inserted;
  }

  async updateDocument(id: number, data: Partial<InsertDocument>) {
    await db.update(documents).set(data).where(eq(documents.id, id));
  }

  async deleteExpiredSessions(): Promise<void> {
    const now = Date.now();
    await db.execute(
      sql`DELETE FROM documents WHERE (metadata->>'expiresAt')::bigint < ${now}`,
    );
  }

  async deleteUserDocuments(userId: string): Promise<void> {
    await db.delete(documents).where(eq(documents.userId, userId));
  }

  async deleteCoreDocumentsBySource(source: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM documents
      WHERE user_id IS NULL AND metadata->>'source' = ${source}
    `);
  }

  async getManifest(userId: string | null): Promise<Document | null> {
    const manifestType = userId ? DOC_TYPES.SESSION_MANIFEST : DOC_TYPES.CORE_MANIFEST;
    const rows = await db
      .select()
      .from(documents)
      .where(
        userId
          ? and(eq(documents.userId, userId), sql`metadata->>'type' = ${manifestType}`)
          : and(isNull(documents.userId), sql`metadata->>'type' = ${manifestType}`),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async getCoreManifest(): Promise<Document | null> {
    return this.getManifest(null);
  }

  async updateManifestPrepStatus(
    userId: string,
    status: PrepStatus,
    prepId: string,
    error?: string,
  ): Promise<void> {
    const manifest = await this.getManifest(userId);
    if (!manifest?.metadata) return;

    const metadata = manifest.metadata as Record<string, unknown>;
    if (metadata.prepId !== prepId) return;

    await this.updateDocument(manifest.id, {
      metadata: {
        ...metadata,
        prepStatus: status,
        ...(error ? { prepError: error } : {}),
      },
    });
  }

  async insertQueryLog(log: any): Promise<void> {
    await db.insert(queryLogs).values({
      ...log,
      relevanceScore: log.relevanceScore?.toString(),
    });
  }
}

export const storage = new DatabaseStorage();
