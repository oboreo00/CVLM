-- Migration: Foundation columns for LLM answer judge telemetry on query_logs
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS judge_verdict text;
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS judge_confidence numeric;
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS judge_rationale text;
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS judge_mode text;
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS judge_disagreed_with_heuristic boolean;
