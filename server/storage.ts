import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { documents, queryLogs, type InsertDocument, type Document } from "@shared/schema";

export interface IStorage {
  createDocument(doc: InsertDocument): Promise<Document>;
  getDocuments(): Promise<Document[]>;
  addDocuments(docs: InsertDocument[]): Promise<Document[]>;
  deleteExpiredSessions(): Promise<void>;
  deleteSessionDocuments(sessionId: string): Promise<void>;
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
    const inserted  = await db.insert(documents).values(docs).returning();
    return inserted;
  }

  async updateDocument(id: number, data: Partial<InsertDocument>) {
    await db.update(documents)
      .set(data)
      .where(eq(documents.id, id));
  }

  async deleteExpiredSessions(): Promise<void> {
    const now = Date.now();
    await db.execute(
      sql`DELETE FROM documents WHERE (metadata->>'expiresAt')::bigint < ${now}`
    );
  }

  async deleteSessionDocuments(sessionId: string): Promise<void> {
    await db.execute(
      sql`DELETE FROM documents WHERE metadata->>'sessionId' = ${sessionId}`
    );
  }

  async insertQueryLog(log: any): Promise<void> {
    await db.insert(queryLogs).values({
      ...log,
      relevanceScore: log.relevanceScore?.toString()
    });
  }
}

export const storage = new DatabaseStorage();
