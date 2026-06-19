-- Repair query_logs RLS: drizzle-kit push can create policies without USING/WITH CHECK.
DROP POLICY IF EXISTS "Users can view own query logs" ON query_logs;
DROP POLICY IF EXISTS "Users can insert own query logs" ON query_logs;

CREATE POLICY "Users can view own query logs"
ON query_logs FOR SELECT
TO authenticated, anon
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own query logs"
ON query_logs FOR INSERT
TO authenticated, anon
WITH CHECK (auth.uid() = user_id);
