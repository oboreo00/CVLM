import { describe, expect, it } from "vitest";
import {
  INITIAL_PREP_DISPLAY,
  prepDisplayForModeSwitch,
  prepDisplayFromPayload,
} from "../client/src/lib/prepDisplayState.ts";

describe("prepDisplayState", () => {
  it("returns null for absent payload", () => {
    expect(prepDisplayFromPayload(null)).toBeNull();
  });

  it("clears starter questions when brief is missing", () => {
    const state = prepDisplayFromPayload({
      prepStatus: "ready",
      chunkIndex: { count: 3, sections: ["experience"] },
    });
    expect(state).toEqual({
      prepStatus: "ready",
      starterQuestions: [],
      chunkIndex: { count: 3, sections: ["experience"] },
    });
  });

  it("clears chunk index when count is absent", () => {
    const state = prepDisplayFromPayload({
      prepStatus: "ready",
      brief: { starterQuestions: ["Role at Acme?"] },
      chunkIndex: { count: undefined as unknown as number, sections: [] },
    });
    expect(state?.chunkIndex).toBeNull();
    expect(state?.starterQuestions).toEqual(["Role at Acme?"]);
  });

  it("resets display on mode switch", () => {
    expect(prepDisplayForModeSwitch()).toEqual(INITIAL_PREP_DISPLAY);
  });
});
