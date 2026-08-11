import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Cron } from "croner";
import type { Automation, AutomationDraft } from "@/lib/automation-types";
import { isSafeId, newId } from "@/lib/id";
import { RUN_LIMITS } from "@/lib/run-types";
import { publish } from "@/server/bus";

const ROOT = path.join(process.cwd(), ".data");

function automationsPath(orgId: string): string {
  if (!isSafeId(orgId)) throw new Error("Id de empresa inválido.");
  return path.join(ROOT, orgId, "automatizaciones.json");
}

/**
 * When it should fire next. Throws if the expression or the zone is not
 * something croner can read, which is how the form validates what you typed.
 */
export function nextRunAfter(
  cron: string,
  timezone: string,
  from: Date,
): string | null {
  return new Cron(cron, { timezone }).nextRun(from)?.toISOString() ?? null;
}

/** Every company with a `.data` directory, which is what the scheduler walks. */
export async function listOrgIds(): Promise<string[]> {
  try {
    const entries = await readdir(ROOT, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && isSafeId(e.name))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export async function listAutomations(orgId: string): Promise<Automation[]> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(automationsPath(orgId), "utf8"),
    );
    return Array.isArray(parsed) ? (parsed as Automation[]) : [];
  } catch {
    return [];
  }
}

async function write(orgId: string, list: Automation[]): Promise<void> {
  await mkdir(path.dirname(automationsPath(orgId)), { recursive: true });
  await writeFile(
    automationsPath(orgId),
    JSON.stringify(list, null, 2),
    "utf8",
  );
  publish(orgId, "automations");
}

function clean(draft: Partial<AutomationDraft>): Partial<AutomationDraft> {
  const out: Partial<AutomationDraft> = {};
  if (typeof draft.name === "string")
    out.name = draft.name.trim().slice(0, 120);
  if (typeof draft.cron === "string")
    out.cron = draft.cron.trim().slice(0, 120);
  if (typeof draft.timezone === "string") {
    out.timezone = draft.timezone.trim().slice(0, 64);
  }
  if (typeof draft.task === "string") {
    out.task = draft.task.trim().slice(0, RUN_LIMITS.maxTaskChars);
  }
  if (typeof draft.agentId === "string") {
    out.agentId = draft.agentId.trim().slice(0, 64);
  }
  if (typeof draft.enabled === "boolean") out.enabled = draft.enabled;
  return out;
}

export async function createAutomation(
  orgId: string,
  draft: Partial<AutomationDraft>,
): Promise<Automation> {
  const input = clean(draft);
  if (!input.task) throw new Error("Falta el pedido.");
  const cron = input.cron || "0 9 * * *";
  const timezone = input.timezone || "UTC";

  const enabled = input.enabled ?? true;
  const automation: Automation = {
    id: newId("a"),
    name: input.name || "Sin nombre",
    cron,
    timezone,
    task: input.task,
    agentId: input.agentId ?? "",
    enabled,
    // Same rule as pausing: with no next run, turning it on later can't fire a
    // slot that went by while it was off.
    nextRunAt: enabled ? nextRunAfter(cron, timezone, new Date()) : null,
    lastRunAt: null,
    lastThreadId: null,
    lastError: null,
    runs: 0,
    cost: 0,
    createdAt: new Date().toISOString(),
  };

  await write(orgId, [automation, ...(await listAutomations(orgId))]);
  return automation;
}

/**
 * The draft half comes from the form and the rest from a corrida that just
 * ended. Anything touching the schedule recomputes when it fires next.
 */
export async function patchAutomation(
  orgId: string,
  id: string,
  patch: Partial<AutomationDraft> &
    Partial<
      Pick<
        Automation,
        | "nextRunAt"
        | "lastRunAt"
        | "lastThreadId"
        | "lastError"
        | "runs"
        | "cost"
      >
    >,
): Promise<Automation | null> {
  const list = await listAutomations(orgId);
  const found = list.find((a) => a.id === id);
  if (!found) return null;

  const updated: Automation = { ...found, ...clean(patch) };
  for (const key of [
    "nextRunAt",
    "lastRunAt",
    "lastThreadId",
    "lastError",
    "runs",
    "cost",
  ] as const) {
    if (patch[key] !== undefined) {
      Object.assign(updated, { [key]: patch[key] });
    }
  }

  // A paused automation keeps no next run, so resuming it never fires a slot
  // that went by while it was off.
  const rescheduled =
    updated.cron !== found.cron ||
    updated.timezone !== found.timezone ||
    updated.enabled !== found.enabled;
  if (rescheduled) {
    updated.nextRunAt = updated.enabled
      ? nextRunAfter(updated.cron, updated.timezone, new Date())
      : null;
  }

  await write(
    orgId,
    list.map((a) => (a.id === id ? updated : a)),
  );
  return updated;
}

export async function deleteAutomation(
  orgId: string,
  id: string,
): Promise<void> {
  await write(
    orgId,
    (await listAutomations(orgId)).filter((a) => a.id !== id),
  );
}
