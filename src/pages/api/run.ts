import type { NextApiRequest, NextApiResponse } from "next";
import { isSafeId } from "@/lib/id";
import { coerceModel } from "@/lib/models";
import {
  RUN_LIMITS,
  type RunAgent,
  type RunEvent,
  type RunRequest,
  type ThreadStep,
} from "@/lib/run-types";
import { addUsage, NO_USAGE, type RunUsage } from "@/lib/usage";
import { runOrg } from "@/server/orchestrator";
import { saveThread, threadTitle } from "@/server/threads";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" }, responseLimit: false },
  maxDuration: 300,
};

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Throws with a message meant for the user; anything else is a 500. */
function parseRequest(body: unknown): RunRequest {
  if (typeof body !== "object" || body === null) throw new Error("Pedido vacío.");
  const raw = body as Record<string, unknown>;

  const task = text(raw.task, RUN_LIMITS.maxTaskChars).trim();
  if (!task) throw new Error("Falta el objetivo.");

  // Both ids become path segments in the file store, so they are checked here
  // rather than trusted from the client.
  const orgId = text(raw.orgId, 64);
  const threadId = text(raw.threadId, 64);
  if (!isSafeId(orgId) || !isSafeId(threadId)) {
    throw new Error("Identificador inválido.");
  }

  if (!Array.isArray(raw.agents) || raw.agents.length === 0) {
    throw new Error("El organigrama no tiene agentes.");
  }
  if (raw.agents.length > RUN_LIMITS.maxAgents) {
    throw new Error(
      `El organigrama supera los ${RUN_LIMITS.maxAgents} agentes por corrida.`,
    );
  }

  const agents: RunAgent[] = raw.agents.map((item) => {
    const a = item as Record<string, unknown>;
    return {
      id: text(a.id, 64),
      role: text(a.role, 120),
      name: text(a.name, 120),
      department: text(a.department, 64),
      instructions: text(a.instructions, RUN_LIMITS.maxInstructionChars),
      model: coerceModel(a.model),
    };
  });

  const ids = new Set(agents.map((a) => a.id));
  const rootId = text(raw.rootId, 64);
  if (!ids.has(rootId)) throw new Error("No se encontró el agente raíz.");

  const reports: Record<string, string[]> = {};
  const rawReports = (raw.reports ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(rawReports)) {
    if (!ids.has(key) || !Array.isArray(value)) continue;
    reports[key] = value.filter(
      (id): id is string => typeof id === "string" && ids.has(id),
    );
  }

  const company = (raw.company ?? {}) as Record<string, unknown>;
  const departments = Array.isArray(raw.departments) ? raw.departments : [];

  return {
    orgId,
    threadId,
    task,
    company: {
      name: text(company.name, 200),
      purpose: text(company.purpose, RUN_LIMITS.maxInstructionChars),
    },
    departments: departments.map((item) => {
      const d = item as Record<string, unknown>;
      return {
        id: text(d.id, 64),
        label: text(d.label, 120),
        mission: text(d.mission, RUN_LIMITS.maxInstructionChars),
      };
    }),
    agents,
    reports,
    rootId,
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

  const roleOf = new Map(request.agents.map((a) => [a.id, a.role]));
  const steps: ThreadStep[] = [];
  let usage: RunUsage = NO_USAGE;

  const stepText = (event: RunEvent): string | null => {
    switch (event.type) {
      case "delegate":
        return `${roleOf.get(event.toId) ?? event.toId}: ${event.task}`;
      case "tool":
        return event.summary;
      case "failed":
        return event.message;
      // The root's result *is* the final answer, which the thread stores apart.
      case "result":
        return event.agentId === request.rootId ? null : event.text;
      default:
        return null;
    }
  };

  // The trace is what the thread replays later, so it is built as it streams.
  const send = (event: RunEvent) => {
    if (event.type === "usage") {
      usage = addUsage(usage, { ...event.usage, cost: event.cost });
    }
    const text = stepText(event);
    if (text !== null && "agentId" in event && event.agentId) {
      steps.push({
        agentId: event.agentId,
        role: roleOf.get(event.agentId) ?? "",
        kind: event.type as ThreadStep["kind"],
        text,
      });
    }
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  try {
    const answer = await runOrg(request, send, controller.signal);
    send({ type: "done", text: answer });
    await saveThread(request.orgId, {
      id: request.threadId,
      title: threadTitle(request.task),
      task: request.task,
      answer,
      steps,
      usage,
    });
  } catch (error) {
    if (!controller.signal.aborted) {
      send({
        type: "error",
        message:
          error instanceof Error ? error.message : "Falló la corrida.",
      });
    }
  } finally {
    res.end();
  }
}
