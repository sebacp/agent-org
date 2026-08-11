import { room } from "@/lib/guard-types";
import type { RunEvent, RunRequest, ThreadStep } from "@/lib/run-types";
import { addUsage, formatCost, NO_USAGE, type RunUsage } from "@/lib/usage";
import { publish } from "@/server/bus";
import { readGuards, recordSpend } from "@/server/guards";
import { runOrg } from "@/server/orchestrator";
import { beginRun, cancelRun, endRun, recordEvent } from "@/server/runs";
import { appendTurn, threadTitle } from "@/server/threads";

export interface RunOutcome {
  answer: string;
  steps: ThreadStep[];
  usage: RunUsage;
}

/**
 * One corrida and the thread it leaves behind. The browser streams the events
 * as they happen and an automation throws them away, but both end up with the
 * same thread on disk.
 */
export async function executeRun(
  request: RunRequest,
  onEvent: (event: RunEvent) => void,
  signal: AbortSignal,
): Promise<RunOutcome> {
  const roleOf = new Map(request.agents.map((a) => [a.id, a.role]));
  const steps: ThreadStep[] = [];
  let usage: RunUsage = NO_USAGE;

  // Asked before anything is spent and not only as it is spent: a company
  // already past its month should not pay for one more token to find that out.
  const guards = await readGuards(request.orgId);
  const left = room(guards);
  if (left !== null && left <= 0) {
    throw new Error(
      `La empresa ya gastó ${formatCost(guards.spent)} este mes y el tope es ${formatCost(
        guards.monthlyCap,
      )}. Subilo desde el gasto del mes, o esperá al mes que viene.`,
    );
  }
  /** Whether this is the corrida that hit it, which reads as a plain abort. */
  let capped = false;

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
      // Checked on every bill rather than at the end, which is the only version
      // of a tope that stops anything: one asked afterwards only tells you what
      // the corrida already spent.
      if (!capped && left !== null && usage.cost >= left) {
        capped = true;
        cancelRun(request.orgId, request.threadId);
      }
    }
    const text = stepText(event);
    if (text !== null && "agentId" in event && event.agentId) {
      steps.push({
        agentId: event.agentId,
        role: roleOf.get(event.agentId) ?? "",
        kind: event.type as ThreadStep["kind"],
        text,
        // What the line summarises and where it came from outlive the corrida:
        // a thread you can only read the conclusions of is one you can only
        // believe.
        ...(event.type === "tool" && event.detail ? { detail: event.detail } : {}),
        ...(event.type === "tool" && event.source ? { source: event.source } : {}),
      });
    }
    // Kept on the server too, so a tab that opens the corrida while it runs
    // sees how it got here instead of joining a trace already in progress.
    recordEvent(request.orgId, request.threadId, event);
    onEvent(event);
  };

  const title = threadTitle(request.task);
  const asked = beginRun(request.orgId, {
    threadId: request.threadId,
    title,
    task: request.task,
    rootId: request.rootId,
    origin: request.origin,
    startedAt: new Date().toISOString(),
  });
  // Either reason to stop counts: the connection dropping, or somebody saying
  // so out of band. An automation passes a signal that never fires, and then
  // this is the only way to reach it.
  const stopped = AbortSignal.any([signal, asked]);

  try {
    const answer = await runOrg(request, send, stopped);
    send({ type: "done", text: answer });

    await appendTurn(
      request.orgId,
      { id: request.threadId, title, origin: request.origin },
      { task: request.task, answer, steps, usage },
    );
    publish(request.orgId, "threads");

    return { answer, steps, usage };
  } catch (error) {
    // Being cut for money arrives here as the same abort as somebody pressing
    // Cortar, and "se cortó la corrida" is not something anybody can act on.
    if (capped) {
      throw new Error(
        `Corté la corrida: la empresa llegó al tope de ${formatCost(
          guards.monthlyCap,
        )} de este mes.`,
      );
    }
    throw error;
  } finally {
    await recordSpend(request.orgId, usage.cost);
    endRun(request.orgId, request.threadId);
  }
}
