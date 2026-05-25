import type { PrepStatusPayload } from "./prepPayload.ts";

type PrepListener = (payload: PrepStatusPayload) => void;

const channels = new Map<string, Set<PrepListener>>();

export function prepChannelKey(mode: "core" | "session", userId?: string): string {
  if (mode === "core") return "core";
  if (!userId) throw new Error("session prep events require userId");
  return `session:${userId}`;
}

export function emitPrepUpdate(
  mode: "core" | "session",
  userId: string | undefined,
  payload: PrepStatusPayload,
): void {
  const key = mode === "core" ? "core" : prepChannelKey("session", userId);
  const listeners = channels.get(key);
  if (!listeners) return;
  for (const listener of listeners) {
    listener(payload);
  }
}

export function subscribePrepUpdates(channelKey: string, listener: PrepListener): () => void {
  let listeners = channels.get(channelKey);
  if (!listeners) {
    listeners = new Set();
    channels.set(channelKey, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners!.delete(listener);
    if (listeners!.size === 0) channels.delete(channelKey);
  };
}

export function writeSseEvent(res: import("express").Response, payload: PrepStatusPayload): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
