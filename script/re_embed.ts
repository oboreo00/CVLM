// scripts/reembed.ts

import "dotenv/config";
import { db } from "../server/db";
import { documents } from "../shared/schema";
import { isNull, eq } from "drizzle-orm";
import { GeminiAdapter } from "../server/services/geminiAdapter";

const ai = new GeminiAdapter({
  useVertex: process.env.USE_VERTEX_AI === "true",
  apiKey: process.env.GEMINI_API_KEY,
  projectId: process.env.GCP_PROJECT_ID,
  location: process.env.GCP_LOCATION,
});

async function getEmbedding(prompt: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: "models/gemini-embedding-001",
    contents: [prompt],
    config: { taskType: 'RETRIEVAL_DOCUMENT' }
  });
  return response.embeddings[0].values;
}

async function main() {
  const docs = await db
    .select()
    .from(documents)
    .where(isNull(documents.embedding));

  console.log(`Found ${docs.length} docs to re-embed`);

  for (const doc of docs) {
    const embedding = await getEmbedding(doc.content);
    await db
      .update(documents)
      .set({ embedding })
      .where(eq(documents.id, doc.id));
    console.log(`Re-embedded doc ${doc.id}`);
  }

  console.log("Done");
  process.exit(0);
}

main().catch(console.error);
