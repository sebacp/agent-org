import type { SourceRef } from "@/lib/run-types";

/**
 * What the company will not do on its own. Both of these exist for the same
 * reason: a corrida can start with nobody watching. An automation fires on a
 * cron, and whatever it decides to do it does at three de la mañana.
 */
export interface Guards {
  /**
   * Dollars a month across every corrida of this company. Zero lifts it, which
   * is something you can choose and not something you can end up with by never
   * having looked.
   */
  monthlyCap: number;
  /**
   * Hold every function that writes until somebody says yes. Which ones those
   * are is the server's own word for it — `readOnlyHint` — and it is already
   * what the permissions screen labels "escribe".
   */
  approveWrites: boolean;
}

/** The guards plus what has been spent against them. */
export interface GuardState extends Guards {
  /** `YYYY-MM`: the month `spent` is counting, which is how it resets. */
  month: string;
  spent: number;
}

export const DEFAULT_GUARDS: Guards = {
  monthlyCap: 20,
  approveWrites: true,
};

/** A function that writes, stopped on its way out until somebody answers. */
export interface PendingWrite {
  id: string;
  threadId: string;
  agentId: string;
  role: string;
  source: SourceRef;
  tool: string;
  /** The arguments as they would go out, pretty-printed. */
  args: string;
  askedAt: string;
}

/** How much of the month is left, or null when nobody set a cap. */
export function room(state: GuardState): number | null {
  return state.monthlyCap > 0 ? state.monthlyCap - state.spent : null;
}
