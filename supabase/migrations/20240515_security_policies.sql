-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable RLS on tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_logs ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- POLICIES FOR 'documents'
--------------------------------------------------------------------------------

-- 1. Users can view their own documents OR global documents (where user_id IS NULL)
CREATE POLICY "Users can view own or global documents"
ON documents FOR SELECT
TO authenticated, anon
USING (auth.uid() = user_id OR user_id IS NULL);

-- 2. Users can only insert documents for their own session
CREATE POLICY "Users can insert own documents"
ON documents FOR INSERT
TO authenticated, anon
WITH CHECK (auth.uid() = user_id);

-- 3. Users can only delete their own documents
CREATE POLICY "Users can delete own documents"
ON documents FOR DELETE
TO authenticated, anon
USING (auth.uid() = user_id);

--------------------------------------------------------------------------------
-- POLICIES FOR 'query_logs'
--------------------------------------------------------------------------------

-- 1. Users can only view their own query logs
CREATE POLICY "Users can view own query logs"
ON query_logs FOR SELECT
TO authenticated, anon
USING (auth.uid() = user_id);

-- 2. Users can only insert query logs for their own session
CREATE POLICY "Users can insert own query logs"
ON query_logs FOR INSERT
TO authenticated, anon
WITH CHECK (auth.uid() = user_id);
