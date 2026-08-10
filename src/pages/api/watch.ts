import type { NextApiRequest, NextApiResponse } from "next";
import { isSafeId } from "@/lib/id";
import type { RunEvent } from "@/lib/run-types";
import { watchRun } from "@/server/runs";

export const config = { api: { responseLimit: false } };

/** A stream that says nothing for long enough gets dropped in the middle. */
const PING_MS = 25_000;

function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads a corrida somebody else set off: an automation, or the same company in
 * another window. Watching only, since the events are already being written by
 * whoever started it.
 */
export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const orgId = param(req.query.orgId);
  const threadId = param(req.query.threadId);
  if (!isSafeId(orgId) || !isSafeId(threadId)) {
    res.status(400).json({ error: "Identificador inválido." });
    return Promise.resolve();
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event: RunEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  return new Promise((resolve) => {
    let ping: NodeJS.Timeout | null = null;
    let stop: (() => void) | null = null;

    // Named rather than implied by closing: an EventSource reconnects on its
    // own, and the corrida it would ask for again is over by then.
    const finish = () => {
      if (ping) clearInterval(ping);
      stop?.();
      stop = null;
      res.write("event: fin\ndata: {}\n\n");
      res.end();
      resolve();
    };

    const stream = watchRun(orgId, threadId, (event) => {
      if (event) send(event);
      else finish();
    });

    if (!stream) {
      send({
        type: "error",
        message: "Esa corrida ya terminó. Buscala en el historial.",
      });
      finish();
      return;
    }

    stop = stream.stop;
    for (const event of stream.replay) send(event);
    ping = setInterval(() => res.write(": ping\n\n"), PING_MS);

    req.on("close", () => {
      if (ping) clearInterval(ping);
      stop?.();
      stop = null;
      resolve();
    });
  });
}
