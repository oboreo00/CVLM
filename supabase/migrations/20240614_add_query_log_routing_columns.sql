-- Migration: Add routing observability columns to query_logs
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS route text;
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS replan_tool text;
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS intent_label text;
