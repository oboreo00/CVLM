-- Migration: Add user_id column to documents and query_logs
ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS user_id uuid;
