ALTER TABLE "query_logs" ADD COLUMN "judge_verdict" text;--> statement-breakpoint
ALTER TABLE "query_logs" ADD COLUMN "judge_confidence" numeric;--> statement-breakpoint
ALTER TABLE "query_logs" ADD COLUMN "judge_rationale" text;--> statement-breakpoint
ALTER TABLE "query_logs" ADD COLUMN "judge_mode" text;--> statement-breakpoint
ALTER TABLE "query_logs" ADD COLUMN "judge_disagreed_with_heuristic" boolean;