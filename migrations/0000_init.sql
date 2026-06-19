CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"embedding" vector(3072),
	"user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "query_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"query_mode" text NOT NULL,
	"total_duration_ms" integer NOT NULL,
	"relevance_score" numeric,
	"models_used" jsonb,
	"step_durations" jsonb,
	"cache_status" jsonb,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"created_at" timestamp DEFAULT now(),
	"user_id" uuid,
	"provider" text,
	"route" text,
	"replan_tool" text,
	"intent_label" text
);
--> statement-breakpoint
ALTER TABLE "query_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own or global documents" ON "documents";
--> statement-breakpoint
CREATE POLICY "Users can view own or global documents" ON "documents" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (auth.uid() = user_id OR user_id IS NULL);
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can insert own documents" ON "documents";
--> statement-breakpoint
CREATE POLICY "Users can insert own documents" ON "documents" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can delete own documents" ON "documents";
--> statement-breakpoint
CREATE POLICY "Users can delete own documents" ON "documents" AS PERMISSIVE FOR DELETE TO "anon", "authenticated" USING (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can view own query logs" ON "query_logs";
--> statement-breakpoint
CREATE POLICY "Users can view own query logs" ON "query_logs" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (auth.uid() = user_id);
--> statement-breakpoint
DROP POLICY IF EXISTS "Users can insert own query logs" ON "query_logs";
--> statement-breakpoint
CREATE POLICY "Users can insert own query logs" ON "query_logs" AS PERMISSIVE FOR INSERT TO "anon", "authenticated" WITH CHECK (auth.uid() = user_id);
