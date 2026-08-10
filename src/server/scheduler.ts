import type { Automation } from "@/lib/automation-types";
import {
  listAutomations,
  listOrgIds,
  nextRunAfter,
  patchAutomation,
} from "@/server/automations";
import { readOrg } from "@/server/org";
import { executeRun } from "@/server/run";
import { newThreadId } from "@/server/threads";

const TICK_MS = 30_000;
/** A slot missed while the app was off still runs, but only if it is recent. */
const CATCH_UP_MS = 60 * 60 * 1000;
/** Nothing an agent does should hold a corrida open longer than this. */
const RUN_CAP_MS = 15 * 60 * 1000;

interface SchedulerState {
  timer: NodeJS.Timeout | null;
  /** One corrida per company at a time; these cost money and share a library. */
  busy: Set<string>;
}

// On the global for the same reason the bus is: editing any server file
// re-evaluates this one, and the interval from before the edit would keep
// firing against a discarded module.
const globals = globalThis as { orgScheduler?: SchedulerState };
const state: SchedulerState = (globals.orgScheduler ??= {
  timer: null,
  busy: new Set(),
});

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Falló la corrida.";
}

/**
 * Runs the automation now and records how it went. Leaves the schedule alone,
 * so pressing "Correr ahora" does not move the next slot.
 */
export async function runAutomation(
  orgId: string,
  automation: Automation,
): Promise<void> {
  if (state.busy.has(orgId)) {
    throw new Error("Esa empresa ya tiene una corrida en curso.");
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("Falta DEEPSEEK_API_KEY. Ponela en .env.local.");
  }

  const org = await readOrg(orgId);
  if (!org) {
    throw new Error(
      "El servidor todavía no tiene el organigrama. Abrí la empresa una vez.",
    );
  }

  state.busy.add(orgId);
  const startedAt = new Date().toISOString();
  const threadId = newThreadId();
  const controller = new AbortController();
  const cap = setTimeout(() => controller.abort(), RUN_CAP_MS);

  // Starting at someone who is no longer on the chart would run nothing, so a
  // stale target falls back to the CEO rather than failing.
  const rootId = org.agents.some((a) => a.id === automation.agentId)
    ? automation.agentId
    : org.rootId;

  try {
    const outcome = await executeRun(
      {
        ...org,
        rootId,
        orgId,
        threadId,
        task: automation.task,
        origin: { kind: "automation", label: automation.name },
        // Every run of an automation opens its own hilo, so there is never
        // anything before it.
        history: [],
      },
      () => undefined,
      controller.signal,
    );
    await patchAutomation(orgId, automation.id, {
      lastRunAt: startedAt,
      lastThreadId: threadId,
      lastError: null,
      runs: automation.runs + 1,
      cost: automation.cost + outcome.usage.cost,
    });
  } catch (error) {
    await patchAutomation(orgId, automation.id, {
      lastRunAt: startedAt,
      lastError: controller.signal.aborted
        ? "Cortada: pasó los 15 minutos."
        : message(error),
      runs: automation.runs + 1,
    });
    throw error;
  } finally {
    clearTimeout(cap);
    state.busy.delete(orgId);
  }
}

async function fire(orgId: string, automation: Automation): Promise<void> {
  const now = new Date();
  const late = now.getTime() - new Date(automation.nextRunAt ?? now).getTime();
  const advanced = {
    nextRunAt: nextRunAfter(automation.cron, automation.timezone, now),
  };

  if (late > CATCH_UP_MS) {
    await patchAutomation(orgId, automation.id, {
      ...advanced,
      lastError: "No corrió: la app estaba apagada a esa hora.",
    });
    return;
  }

  // The slot moves before the corrida rather than after it, so one that takes
  // twenty minutes cannot fire twice.
  await patchAutomation(orgId, automation.id, advanced);
  await runAutomation(orgId, automation).catch(() => undefined);
}

async function tick(): Promise<void> {
  const now = Date.now();
  for (const orgId of await listOrgIds()) {
    if (state.busy.has(orgId)) continue;
    // One per company per tick: the rest wait rather than pile onto the same
    // library at once.
    const due = (await listAutomations(orgId)).find(
      (a) => a.enabled && a.nextRunAt && Date.parse(a.nextRunAt) <= now,
    );
    if (due) void fire(orgId, due);
  }
}

export function startScheduler(): void {
  if (state.timer) return;
  state.timer = setInterval(() => {
    void tick().catch((error: unknown) => {
      console.error("Scheduler:", error);
    });
  }, TICK_MS);
}
