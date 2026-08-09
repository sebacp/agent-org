import type { OrgTopic } from "@/lib/event-types";

type Listener = (topic: OrgTopic) => void;

// On the global rather than the module: editing any server file re-evaluates
// this one, and a stream opened before the edit would keep publishing into the
// discarded map.
const globals = globalThis as { orgBus?: Map<string, Set<Listener>> };
const listeners = (globals.orgBus ??= new Map());

export function subscribe(orgId: string, listener: Listener): () => void {
  const set = listeners.get(orgId) ?? new Set<Listener>();
  listeners.set(orgId, set);
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(orgId);
  };
}

export function publish(orgId: string, topic: OrgTopic): void {
  for (const listener of listeners.get(orgId) ?? []) listener(topic);
}
