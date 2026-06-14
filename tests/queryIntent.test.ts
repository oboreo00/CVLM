import { describe, expect, it } from "vitest";
import {
  INTENT_LABELS,
  RECOVERY_HINTS,
  REPLAN_TRIGGERS,
  isIntentLabel,
  isRecoveryHint,
  isReplanTrigger,
} from "@shared/queryIntent";

describe("queryIntent constants", () => {
  it("validates intent labels", () => {
    expect(isIntentLabel(INTENT_LABELS.CAREER_ADVICE)).toBe(true);
    expect(isIntentLabel("not_an_intent")).toBe(false);
  });

  it("validates recovery hints", () => {
    expect(isRecoveryHint(RECOVERY_HINTS.HYBRID_WEB)).toBe(true);
    expect(isRecoveryHint("call_mom")).toBe(false);
  });

  it("validates replan triggers", () => {
    expect(isReplanTrigger(REPLAN_TRIGGERS.LOW_RELEVANCE)).toBe(true);
    expect(isReplanTrigger("panic")).toBe(false);
  });
});
