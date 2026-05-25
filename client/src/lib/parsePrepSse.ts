/**
 * Parses SSE frames from a text buffer (event stream data: lines).
 * Returns parsed JSON payloads and any incomplete trailing buffer.
 */
export function extractPrepPayloadsFromSseBuffer(buffer: string): {
  payloads: unknown[];
  remaining: string;
} {
  const payloads: unknown[] = [];
  let remaining = buffer;

  let boundary = remaining.indexOf("\n\n");
  while (boundary !== -1) {
    const frame = remaining.slice(0, boundary);
    remaining = remaining.slice(boundary + 2);
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        payloads.push(JSON.parse(line.slice(6)));
      } catch {
        /* ignore malformed frames */
      }
    }
    boundary = remaining.indexOf("\n\n");
  }

  return { payloads, remaining };
}
