import { useCallback, useEffect, useState } from "react";
import { fetchGuards, revokeGrant, saveGuards } from "@/lib/api";
import {
  DEFAULT_GUARDS,
  type GuardState,
  type Guards,
} from "@/lib/guard-types";

const UNKNOWN: GuardState = { ...DEFAULT_GUARDS, month: "", spent: 0 };

/**
 * The tope and what the month has spent against it. It lives on the server
 * rather than in the browser like the organigrama does, because the thing it
 * has to stop is a corrida nobody has a tab open for.
 */
export function useGuards(orgId: string) {
  const [guards, setGuards] = useState<GuardState>(UNKNOWN);

  const refresh = useCallback(async () => {
    setGuards(await fetchGuards(orgId).catch(() => UNKNOWN));
  }, [orgId]);

  useEffect(() => {
    let live = true;
    void fetchGuards(orgId)
      .catch(() => UNKNOWN)
      .then((state) => {
        if (live) setGuards(state);
      });
    return () => {
      live = false;
    };
  }, [orgId]);

  const save = useCallback(
    async (patch: Partial<Guards>) => {
      setGuards(await saveGuards(orgId, patch));
    },
    [orgId],
  );

  const revoke = useCallback(
    async (sourceId: string, tool: string) => {
      setGuards(await revokeGrant(orgId, sourceId, tool));
    },
    [orgId],
  );

  return { guards, save, revoke, refresh };
}
