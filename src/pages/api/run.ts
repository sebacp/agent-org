import type { NextApiRequest, NextApiResponse } from "next";
import { isSafeId } from "@/lib/id";
import {
  MANUAL_ORIGIN,
  RUN_LIMITS,
  type Exchange,
  type RunEvent,
  type RunOrigin,
  type RunRequest,
} from "@/lib/run-types";
import { parseSnapshot, text } from "@/server/org";
import { executeRun } from "@/server/run";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" }, responseLimit: false },
  maxDuration: 300,
};

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    res
      .status(500)
      .json({ error: "Falta DEEPSEEK_API_KEY. Ponela en .env.local." });
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

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event: RunEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  try {
    await executeRun(request, send, controller.signal);
  } catch (error) {
    if (!controller.signal.aborted) {
      send({
        type: "error",
        message: error instanceof Error ? error.message : "Falló la corrida.",
      });
    }
  } finally {
    res.end();
  }
}
