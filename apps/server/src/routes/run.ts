import { Router, json } from "express";
import { isSafeId } from "@agent-org/shared/id";
import {
  MANUAL_ORIGIN,
  RUN_LIMITS,
  type Exchange,
  type RunEvent,
  type RunOrigin,
  type RunRequest,
} from "@agent-org/shared/run-types";
import { parseSnapshot, text } from "../core/org";
import { executeRun } from "../core/run";
import { cancelRun } from "../core/runs";
import { openStream } from "./stream";

/**
 * A corrida asked for over HTTP is one you set off, so it can call itself a
 * pedido or a retomada but never an automation: those only start in the
 * scheduler.
 */
function parseOrigin(raw: unknown): RunOrigin {
  const origin = (raw ?? {}) as Record<string, unknown>;
  if (origin.kind !== "task") return MANUAL_ORIGIN;
  return { kind: "task", label: text(origin.label, 120) };
}

/**
 * The hilo as the tab has it. It is the client's copy of something the server
 * already wrote, so it is trimmed like any other input, and a half exchange —
 * a pedido that errored out, say — is dropped rather than left hanging.
 */
function parseHistory(raw: unknown): Exchange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const turn = (item ?? {}) as Record<string, unknown>;
      return {
        task: text(turn.task, RUN_LIMITS.maxTaskChars).trim(),
        answer: text(turn.answer, RUN_LIMITS.maxAnswerChars).trim(),
      };
    })
    .filter((turn) => turn.task && turn.answer)
    .slice(-RUN_LIMITS.maxHistory);
}

/** Throws with a message meant for the user; anything else is a 500. */
function parseRequest(body: unknown): RunRequest {
  const raw = (body ?? {}) as Record<string, unknown>;

  const task = text(raw.task, RUN_LIMITS.maxTaskChars).trim();
  if (!task) throw new Error("Falta el objetivo.");

  // Both ids become path segments in the file store, so they are checked here
  // rather than trusted from the client.
  const orgId = text(raw.orgId, 64);
  const threadId = text(raw.threadId, 64);
  if (!isSafeId(orgId) || !isSafeId(threadId)) {
    throw new Error("Identificador inválido.");
  }

  return {
    ...parseSnapshot(body),
    orgId,
    threadId,
    task,
    origin: parseOrigin(raw.origin),
    history: parseHistory(raw.history),
  };
}

export const runRouter = Router();

// Cortar comes in on its own request: the one streaming the corrida is busy
// streaming it, and may not even be open in the tab doing the asking.
runRouter.delete("/", (req, res) => {
  const { orgId, threadId } = req.query;
  if (typeof orgId !== "string" || typeof threadId !== "string") {
    res.status(400).json({ error: "Falta la corrida." });
    return;
  }
  res.status(200).json({ stopped: cancelRun(orgId, threadId) });
});

runRouter.post("/", json({ limit: "1mb" }), async (req, res) => {
  if (!process.env.DEEPSEEK_API_KEY) {
    res.status(500).json({ error: "Falta DEEPSEEK_API_KEY. Ponela en .env." });
    return;
  }

  let request: RunRequest;
  try {
    request = parseRequest(req.body);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Pedido inválido.",
    });
    return;
  }

  const stream = openStream(res);
  const send = (event: RunEvent) => stream.send(event);

  // No signal, so nothing here ends the corrida but the DELETE above: it belongs
  // to the company and not to the connection that asked for it. This one going
  // away used to cut it, and since changing hilo lets go of the stream, leaving
  // one running and starting another killed the first — it vanished off the riel
  // mid-sentence. Now it stays there and /api/watch picks it back up.
  try {
    await executeRun(request, send);
  } catch (error) {
    send({
      type: "error",
      // Being cut short arrives here as the same kind of failure as anything
      // else, and the browser's wording for it says nothing to anybody.
      message:
        error instanceof Error && error.name === "AbortError"
          ? "Se cortó la corrida."
          : error instanceof Error
            ? error.message
            : "Falló la corrida.",
    });
  } finally {
    stream.close();
  }
});

runRouter.all("/", (_req, res) => {
  res.setHeader("Allow", "POST, DELETE");
  res.status(405).json({ error: "Método no permitido." });
});
