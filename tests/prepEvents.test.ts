import { describe, expect, it } from "vitest";
import { emitPrepUpdate, prepChannelKey, subscribePrepUpdates } from "../server/services/prepEvents.ts";

describe("prepEvents", () => {
  it("delivers updates to subscribers on the same channel", () => {
    const key = prepChannelKey("session", "user-1");
    const received: string[] = [];

    const unsub = subscribePrepUpdates(key, (p) => received.push(p.prepStatus));

    emitPrepUpdate("session", "user-1", { prepStatus: "pending" });
    emitPrepUpdate("session", "user-1", { prepStatus: "ready" });

    unsub();
    emitPrepUpdate("session", "user-1", { prepStatus: "failed" });

    expect(received).toEqual(["pending", "ready"]);
  });

  it("isolates core and session channels", () => {
    const core: string[] = [];
    const session: string[] = [];

    const unsubCore = subscribePrepUpdates(prepChannelKey("core"), (p) => core.push(p.prepStatus));
    const unsubSession = subscribePrepUpdates(prepChannelKey("session", "u2"), (p) =>
      session.push(p.prepStatus),
    );

    emitPrepUpdate("core", undefined, { prepStatus: "ready" });
    emitPrepUpdate("session", "u2", { prepStatus: "pending" });

    unsubCore();
    unsubSession();

    expect(core).toEqual(["ready"]);
    expect(session).toEqual(["pending"]);
  });
});
