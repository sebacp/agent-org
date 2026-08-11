import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_GUARDS,
  isGranted,
  type GuardState,
  type Guards,
  type WriteGrant,
} from "@/lib/guard-types";
import { isSafeId } from "@/lib/id";
import { publish } from "@/server/bus";

const ROOT = path.join(process.cwd(), ".data");

/** A cap of more than this is somebody's typo, not somebody's budget. */
const MAX_CAP = 100_000;

function guardsPath(orgId: string): string {
  if (!isSafeId(orgId)) throw new Error("Id de empresa inválido.");
  return path.join(ROOT, orgId, "resguardos.json");
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * A company that never set any of this gets the defaults, and one whose file
 * says last month gets a counter at zero: the total belongs to a month, so
 * August's spend is not a smaller number than July's, it is another question.
 */
/** Anything half-written into the file is a permission nobody can read. */
function cleanGrants(raw: unknown): WriteGrant[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const g = (entry ?? {}) as Partial<WriteGrant>;
    return typeof g.sourceId === "string" && typeof g.tool === "string"
      ? [
          {
            sourceId: g.sourceId,
            sourceLabel: g.sourceLabel ?? g.sourceId,
            tool: g.tool,
            grantedAt: g.grantedAt ?? "",
          },
        ]
      : [];
  });
}

function normalize(raw: unknown): GuardState {
  const saved = (raw ?? {}) as Partial<GuardState>;
  const month = thisMonth();
  return {
    monthlyCap:
      typeof saved.monthlyCap === "number" && saved.monthlyCap >= 0
        ? saved.monthlyCap
        : DEFAULT_GUARDS.monthlyCap,
    approveWrites: saved.approveWrites !== false,
    grants: cleanGrants(saved.grants),
    month,
    spent:
      saved.month === month && typeof saved.spent === "number"
        ? saved.spent
        : 0,
  };
}

export async function readGuards(orgId: string): Promise<GuardState> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(guardsPath(orgId), "utf8"),
    );
    return normalize(parsed);
  } catch {
    return normalize(null);
  }
}

// Two corridas can end in the same instant and both add to the month, and a
// read-modify-write that races another erases what the other just counted —
// which on a spend counter means the cap quietly stops holding.
const globals = globalThis as { orgGuardQueue?: Map<string, Promise<unknown>> };
const queue = (globals.orgGuardQueue ??= new Map());

function serially<T>(orgId: string, job: () => Promise<T>): Promise<T> {
  const next = (queue.get(orgId) ?? Promise.resolve()).then(job, job);
  queue.set(
    orgId,
    next.catch(() => undefined),
  );
  return next;
}

async function write(orgId: string, state: GuardState): Promise<void> {
  await mkdir(path.dirname(guardsPath(orgId)), { recursive: true });
  await writeFile(guardsPath(orgId), JSON.stringify(state, null, 2), "utf8");
  publish(orgId, "guards");
}

export function saveGuards(
  orgId: string,
  patch: Partial<Guards>,
): Promise<GuardState> {
  return serially(orgId, async () => {
    const current = await readGuards(orgId);
    const next: GuardState = {
      ...current,
      ...(typeof patch.monthlyCap === "number" && patch.monthlyCap >= 0
        ? { monthlyCap: Math.min(patch.monthlyCap, MAX_CAP) }
        : {}),
      ...(typeof patch.approveWrites === "boolean"
        ? { approveWrites: patch.approveWrites }
        : {}),
    };
    await write(orgId, next);
    return next;
  });
}

/**
 * Stops asking about one function of one source. Granted from the card that
 * asked, so what lands here is the answer to a question that was on screen —
 * never something that had to be typed out and could name the wrong tool.
 */
export function grantWrite(
  orgId: string,
  grant: Omit<WriteGrant, "grantedAt">,
): Promise<GuardState> {
  return serially(orgId, async () => {
    const current = await readGuards(orgId);
    if (isGranted(current.grants, grant.sourceId, grant.tool)) return current;
    const next: GuardState = {
      ...current,
      grants: [
        ...current.grants,
        { ...grant, grantedAt: new Date().toISOString() },
      ],
    };
    await write(orgId, next);
    return next;
  });
}

/** Back to being asked about. The next call is the one that stops. */
export function revokeWrite(
  orgId: string,
  sourceId: string,
  tool: string,
): Promise<GuardState> {
  return serially(orgId, async () => {
    const current = await readGuards(orgId);
    const next: GuardState = {
      ...current,
      grants: current.grants.filter(
        (g) => !(g.sourceId === sourceId && g.tool === tool),
      ),
    };
    await write(orgId, next);
    return next;
  });
}

/**
 * Adds what a corrida cost to the month, however the corrida ended. The one
 * that was cut short is the one whose spend matters most: a run that burns the
 * cap and gets stopped has to leave the cap burnt behind it, or the next one
 * starts over with the same room and does it again.
 */
export function recordSpend(orgId: string, cost: number): Promise<void> {
  if (!(cost > 0)) return Promise.resolve();
  return serially(orgId, async () => {
    const current = await readGuards(orgId);
    await write(orgId, { ...current, spent: current.spent + cost });
  });
}
