import type { Response } from "express";

/** A stream that says nothing for long enough gets dropped in the middle. */
const PING_MS = 25_000;

export interface Stream {
  send(event: unknown): void;
  /** Writes a named event, which an EventSource can listen for by name. */
  named(name: string): void;
  close(): void;
}

/**
 * Opens an SSE stream. The headers go out before anything is written so the
 * browser stops waiting, and a proxy in front of us stops holding the reply:
 * with the web app on one port and this on another, every stream now crosses
 * one.
 */
export function openStream(res: Response): Stream {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const ping = setInterval(() => res.write(": ping\n\n"), PING_MS);
  let open = true;

  const close = () => {
    if (!open) return;
    open = false;
    clearInterval(ping);
    res.end();
  };

  // The response, never the request: a request closes as soon as its body has
  // been read, which for anything sent with a POST is before the first word of
  // the answer exists. Listening there hung every corrida on the second it
  // started — headers out, and then silence until something upstream gave up.
  res.on("close", () => {
    open = false;
    clearInterval(ping);
  });

  return {
    send(event) {
      if (open) res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    named(name) {
      if (open) res.write(`event: ${name}\ndata: {}\n\n`);
    },
    close,
  };
}
