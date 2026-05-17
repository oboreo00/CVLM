-- Migration: Add provider column to query_logs
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS provider text;
