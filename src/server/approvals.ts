import type { PendingWrite } from "@/lib/guard-types";
import { newId } from "@/lib/id";
import { publish } from "@/server/bus";

/**
 * How long a write waits for a person. Past this it gives up rather than hold
 * the corrida open: an automation that fires at three in the morning would
 * otherwise sit on a tool call until something else killed it, and the agent
 * would never get to say what it could not do.
 */
const WAIT_MS = 5 * 60_000;

export type Verdict = "yes" | "no" | "nobody";

interface Waiting {
  write: PendingWrite;
  settle: (verdict: Verdict) => void;
}

// On the global for the same reason the bus is: editing any server file
// re-evaluates this one, and a call parked before the edit would wait on a map
// nobody can answer into any more.
const globals = globalThis as {
  orgApprovals?: Map<string, Map<string, Waiting>>;
};
const waiting = (globals.orgApprovals ??= new Map());

/** What is stopped right now, for whichever tab asks — including none of them. */
export function listApprovals(orgId: string): PendingWrite[] {
  return [...(waiting.get(orgId)?.values() ?? [])]
    .map((held) => held.write)
    .sort((a, b) => a.askedAt.localeCompare(b.askedAt));
}

/** The one being answered, so a "siempre" knows what it is granting. */
export function findApproval(orgId: string, id: string): PendingWrite | null {
  return waiting.get(orgId)?.get(id)?.write ?? null;
}

/**
 * Parks the call and returns once somebody answers, nobody does, or the
 * corrida is cut. The promise is the tool call itself: there is one request
 * running the whole company, so the wait has to live somewhere anybody can
 * reach from outside it.
 */
export function askApproval(
  orgId: string,
  ask: Omit<PendingWrite, "id" | "askedAt">,
  signal: AbortSignal,
): Promise<Verdict> {
  const id = newId("ap");
  const write: PendingWrite = { ...ask, id, askedAt: new Date().toISOString() };
  const forOrg = waiting.get(orgId) ?? new Map<string, Waiting>();
  waiting.set(orgId, forOrg);

  return new Promise<Verdict>((resolve) => {
    let timer: NodeJS.Timeout | null = null;
    let done = false;

    const finish = (verdict: Verdict) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      forOrg.delete(id);
      if (forOrg.size === 0) waiting.delete(orgId);
      publish(orgId, "approvals");
      resolve(verdict);
    };

    function onAbort() {
      finish("nobody");
    }

    forOrg.set(id, { write, settle: finish });
    publish(orgId, "approvals");

    if (signal.aborted) {
      finish("nobody");
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => finish("nobody"), WAIT_MS);
  });
}

/** False when the call was already answered, gave up, or was cut. */
export function answerApproval(
  orgId: string,
  id: string,
  ok: boolean,
): boolean {
  const held = waiting.get(orgId)?.get(id);
  if (!held) return false;
  held.settle(ok ? "yes" : "no");
  return true;
}
