import { db } from "../server/db";
import { documents } from "../shared/schema";

async function clearDb() {
  console.log("Connecting to database to clear entries...");
  try {
    const result = await db.delete(documents);
    console.log("Success: All entries in the 'documents' table have been deleted.");
    console.log("Note: You should restart your server ('npm run dev') to clear the in-memory vector store as well.");
    process.exit(0);
  } catch (err) {
    console.error("Error clearing database:", err);
    process.exit(1);
  }
}

clearDb();
