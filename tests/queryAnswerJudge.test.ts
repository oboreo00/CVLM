import { afterEach, describe, expect, it } from "vitest";
import {
  judgeDisagreesWithHeuristic,
  isAnswerJudgeShadowEnabled,
  parseAnswerJudgeResponse,
} from "../server/services/queryAnswerJudge.ts";
import { JUDGE_VERDICTS } from "@shared/judgeVerdict.ts";

describe("queryAnswerJudge", () => {
  afterEach(() => {
    delete process.env.ANSWER_JUDGE_SHADOW;
  });

  it("isAnswerJudgeShadowEnabled is opt-in", () => {
    expect(isAnswerJudgeShadowEnabled()).toBe(false);
    process.env.ANSWER_JUDGE_SHADOW = "true";
    expect(isAnswerJudgeShadowEnabled()).toBe(true);
  });

  it("parseAnswerJudgeResponse accepts valid JSON", () => {
    const parsed = parseAnswerJudgeResponse(
      `{"verdict":"${JUDGE_VERDICTS.NEEDS_HYBRID}","confidence":0.82,"rationale":"Career advice not covered by resume."}`,
    );
    expect(parsed?.verdict).toBe(JUDGE_VERDICTS.NEEDS_HYBRID);
    expect(parsed?.confidence).toBe(0.82);
    expect(parsed?.rationale).toContain("Career advice");
  });

  it("parseAnswerJudgeResponse rejects unknown verdict", () => {
    expect(parseAnswerJudgeResponse('{"verdict":"bad","confidence":0.5}')).toBeNull();
  });

  it("judgeDisagreesWithHeuristic when local kept but judge wants escalation", () => {
    expect(
      judgeDisagreesWithHeuristic(true, JUDGE_VERDICTS.NEEDS_HYBRID),
    ).toBe(true);
    expect(
      judgeDisagreesWithHeuristic(true, JUDGE_VERDICTS.SUFFICIENT),
    ).toBe(false);
  });

  it("judgeDisagreesWithHeuristic when replanning but judge says sufficient", () => {
    expect(
      judgeDisagreesWithHeuristic(false, JUDGE_VERDICTS.SUFFICIENT),
    ).toBe(true);
    expect(
      judgeDisagreesWithHeuristic(false, JUDGE_VERDICTS.INSUFFICIENT_RETRIEVAL),
    ).toBe(false);
  });
});
