import type { ActiveRun, RunEvent } from "@/lib/run-types";
import { publish } from "@/server/bus";

/**
 * Past this the oldest events go. A corrida of eighty steps is normal and the
 * whole trace ends up on disk anyway, so a tab that joins a very long one late
 * sees the recent part rather than costing the server unbounded memory.
 */
const MAX_EVENTS = 1000;

/** Null means the corrida is over: a watcher can't tell that from a quiet one. */
type Watcher = (event: RunEvent | null) => void;

interface LiveRun {
  run: ActiveRun;
  events: RunEvent[];
  watchers: Set<Watcher>;
}

// On the global for the same reason the bus is: editing any server file
// re-evaluates this one, and a corrida started before the edit would never be
// cleared from the discarded map. Keyed apart from the older metadata-only map
// so a dev reload can't read one shape as the other.
const globals = globalThis as { orgLiveRuns?: Map<string, Map<string, LiveRun>> };
const running = (globals.orgLiveRuns ??= new Map());

/**
 * What is happening right now, for any tab that asks. A corrida lives only in
 * the process running it, so this is memory rather than disk: nothing is in
 * flight after a restart.
 */
export function listRuns(orgId: string): ActiveRun[] {
  return [...(running.get(orgId)?.values() ?? [])]
    .map((live) => live.run)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function beginRun(orgId: string, run: ActiveRun): void {
  const forOrg = running.get(orgId) ?? new Map<string, LiveRun>();
  running.set(orgId, forOrg);
  forOrg.set(run.threadId, { run, events: [], watchers: new Set() });
  publish(orgId, "runs");
}

export function recordEvent(
  orgId: string,
  threadId: string,
  event: RunEvent,
): void {
  const live = running.get(orgId)?.get(threadId);
  if (!live) return;
  // A delta is worth nothing replayed — the finished text arrives as its own
  // event — and there are thousands of them, so buffering would push the trace
  // out of the very buffer that exists to replay it.
  if (event.type !== "stream") {
    live.events.push(event);
    if (live.events.length > MAX_EVENTS) live.events.shift();
  }
  for (const watcher of live.watchers) watcher(event);
}

/**
 * Everything the corrida has emitted so far, then the rest as it happens. The
 * replay is handed back rather than pushed so the caller can write it out
 * before the first live event, with no window in between for one to slip past.
 */
export function watchRun(
  orgId: string,
  threadId: string,
  watcher: Watcher,
): { replay: RunEvent[]; stop: () => void } | null {
  const live = running.get(orgId)?.get(threadId);
  if (!live) return null;
  live.watchers.add(watcher);
  return {
    replay: [...live.events],
    stop: () => live.watchers.delete(watcher),
  };
}

export function endRun(orgId: string, threadId: string): void {
  const forOrg = running.get(orgId);
  const live = forOrg?.get(threadId);
  if (!forOrg || !live) return;
  forOrg.delete(threadId);
  if (forOrg.size === 0) running.delete(orgId);
  for (const watcher of live.watchers) watcher(null);
  live.watchers.clear();
  publish(orgId, "runs");
}
