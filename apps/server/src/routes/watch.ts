import { Router } from "express";
import { isSafeId } from "@agent-org/shared/id";
import { subscribe } from "../core/bus";
import { watchRun } from "../core/runs";
import { openStream } from "./stream";

export const watchRouter = Router();

/**
 * Reads a corrida somebody else set off: an automation, or the same company in
 * another window. Watching only, since the events are already being written by
 * whoever started it.
 */
watchRouter.get("/", (req, res) => {
  const { orgId, threadId } = req.query;
  if (
    typeof orgId !== "string" ||
    typeof threadId !== "string" ||
    !isSafeId(orgId) ||
    !isSafeId(threadId)
  ) {
    res.status(400).json({ error: "Identificador inválido." });
    return;
  }

  const stream = openStream(res);
  let stop: (() => void) | null = null;

  // Named rather than implied by closing: an EventSource reconnects on its
  // own, and the corrida it would ask for again is over by then.
  const finish = () => {
    stop?.();
    stop = null;
    stream.named("fin");
    stream.close();
  };

  const live = watchRun(orgId, threadId, (event) => {
    if (event) stream.send(event);
    else finish();
  });

  if (!live) {
    stream.send({
      type: "error",
      message: "Esa corrida ya terminó. Buscala en el historial.",
    });
    finish();
    return;
  }

  stop = live.stop;
  for (const event of live.replay) stream.send(event);

  res.on("close", () => {
    stop?.();
    stop = null;
  });
});

export const eventsRouter = Router();

/** What changed in the company, so every tab can go and read it again. */
eventsRouter.get("/", (req, res) => {
  const { orgId } = req.query;
  if (typeof orgId !== "string" || !isSafeId(orgId)) {
    res.status(400).json({ error: "Id de empresa inválido." });
    return;
  }

  const stream = openStream(res);
  // What changed, not how: the browser already knows how to read each list, and
  // sending the lists themselves would fan every write out to every tab.
  const unsubscribe = subscribe(orgId, (topic) => stream.send({ topic }));

  res.on("close", () => {
    unsubscribe();
    stream.close();
  });
});
