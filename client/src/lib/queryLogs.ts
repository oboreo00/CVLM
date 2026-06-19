import { supabase } from "@/lib/supabase";

/** Narrow read shape for the “Show Stats” panel (Supabase direct; swap for API on Neon). */
export interface QueryLogStatRow {
  question: string;
  intentLabel: string | null;
  totalTokens: number | null;
  modelsUsed: {
    synthesis?: string;
    analysis?: string;
    embedding?: string;
  } | null;
  createdAt: string | null;
}

export function truncateQuestion(text: string, maxLen = 100): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function formatStatModel(
  models: QueryLogStatRow["modelsUsed"],
): string {
  if (!models || typeof models !== "object") return "—";
  return models.synthesis ?? models.analysis ?? models.embedding ?? "—";
}

export async function fetchRecentQueryLogs(limit = 3): Promise<QueryLogStatRow[]> {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.session) {
      return [];
    }
    session = data.session;
  }

  const { data, error } = await supabase
    .from("query_logs")
    .select("question, intent_label, total_tokens, models_used, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    question: row.question,
    intentLabel: row.intent_label,
    totalTokens: row.total_tokens,
    modelsUsed: row.models_used as QueryLogStatRow["modelsUsed"],
    createdAt: row.created_at,
  }));
}
