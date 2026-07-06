-- Migration: Persist replan gate reason on query_logs (telemetry already emitted replanReason)
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS replan_reason text;
