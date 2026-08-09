import type { NextApiRequest, NextApiResponse } from "next";
import { isSafeId } from "@/lib/id";
import { subscribe } from "@/server/bus";

export const config = { api: { responseLimit: false } };

/** A stream that says nothing for long enough gets dropped in the middle. */
const PING_MS = 25_000;

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const orgId = typeof req.query.orgId === "string" ? req.query.orgId : "";
  if (!isSafeId(orgId)) {
    res.status(400).json({ error: "Id de empresa inválido." });
    return Promise.resolve();
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // What changed, not how: the browser already knows how to read each list, and
  // sending the lists themselves would fan every write out to every tab.
  const unsubscribe = subscribe(orgId, (topic) => {
    res.write(`data: ${JSON.stringify({ topic })}\n\n`);
  });
  const ping = setInterval(() => res.write(": ping\n\n"), PING_MS);

  // Resolving only on close keeps Next from warning about a handler that
  // returned without answering.
  return new Promise((resolve) => {
    req.on("close", () => {
      clearInterval(ping);
      unsubscribe();
      res.end();
      resolve();
    });
  });
}
