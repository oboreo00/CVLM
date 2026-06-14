/**
 * Shared intent / recovery vocabulary for query routing.
 *
 * INTENT_LABELS  — question type from classifyQueryIntent
 * RECOVERY_HINTS — soft recovery suggestion from intent (gate may override)
 * REPLAN_TRIGGERS — why the replan gate was invoked
 */

export const INTENT_LABELS = {
  FACTUAL_PERSONAL: "factual_personal",
  CAREER_ADVICE: "career_advice",
  MULTI_PART: "multi_part",
  OFF_DOMAIN: "off_domain",
} as const;

export type IntentLabel = (typeof INTENT_LABELS)[keyof typeof INTENT_LABELS];

export const RECOVERY_HINTS = {
  HYBRID_WEB: "hybrid_web",
  RETRY_RETRIEVAL: "retry_retrieval",
  LOCAL_RAG: "local_rag",
} as const;

export type RecoveryHint = (typeof RECOVERY_HINTS)[keyof typeof RECOVERY_HINTS];

export const REPLAN_TRIGGERS = {
  NEEDS_WEB_INTENT: "needs_web_intent",
  LOW_RELEVANCE: "low_relevance",
  UNCERTAIN_LOCAL_ANSWER: "uncertain_local_answer",
} as const;

export type ReplanTrigger = (typeof REPLAN_TRIGGERS)[keyof typeof REPLAN_TRIGGERS];

const INTENT_LABEL_SET = new Set<string>(Object.values(INTENT_LABELS));
const RECOVERY_HINT_SET = new Set<string>(Object.values(RECOVERY_HINTS));
const REPLAN_TRIGGER_SET = new Set<string>(Object.values(REPLAN_TRIGGERS));

export function isIntentLabel(value: string): value is IntentLabel {
  return INTENT_LABEL_SET.has(value);
}

export function isRecoveryHint(value: string): value is RecoveryHint {
  return RECOVERY_HINT_SET.has(value);
}

export function isReplanTrigger(value: string): value is ReplanTrigger {
  return REPLAN_TRIGGER_SET.has(value);
}
