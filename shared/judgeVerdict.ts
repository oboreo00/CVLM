/**
 * Vocabulary for LLM answer-quality judge (routing advisory).
 * Persisted on query_logs when judge runs (shadow or live); null until then.
 */

export const JUDGE_VERDICTS = {
  SUFFICIENT: "sufficient",
  INSUFFICIENT_RETRIEVAL: "insufficient_retrieval",
  NEEDS_HYBRID: "needs_hybrid",
  UNCERTAIN: "uncertain",
} as const;

export type JudgeVerdict = (typeof JUDGE_VERDICTS)[keyof typeof JUDGE_VERDICTS];

export const JUDGE_MODES = {
  SHADOW: "shadow",
  LIVE: "live",
} as const;

export type JudgeMode = (typeof JUDGE_MODES)[keyof typeof JUDGE_MODES];

const JUDGE_VERDICT_SET = new Set<string>(Object.values(JUDGE_VERDICTS));
const JUDGE_MODE_SET = new Set<string>(Object.values(JUDGE_MODES));

export function isJudgeVerdict(value: string): value is JudgeVerdict {
  return JUDGE_VERDICT_SET.has(value);
}

export function isJudgeMode(value: string): value is JudgeMode {
  return JUDGE_MODE_SET.has(value);
}

/** Max rationale length stored on query_logs. */
export const JUDGE_RATIONALE_MAX_LEN = 500;
