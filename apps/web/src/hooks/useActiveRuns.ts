import { useCallback, useEffect, useState } from "react";
import { fetchActiveRuns } from "@/lib/api";
import type { ActiveRun } from "@agent-org/shared/run-types";

function load(orgId: string): Promise<ActiveRun[]> {
  return fetchActiveRuns(orgId).catch(() => []);
}

export function useActiveRuns(orgId: string) {
  const [runs, setRuns] = useState<ActiveRun[]>([]);

  useEffect(() => {
    let live = true;
    void load(orgId).then((list) => {
      if (live) setRuns(list);
    });
    return () => {
      live = false;
    };
  }, [orgId]);

  const refresh = useCallback(async () => {
    setRuns(await load(orgId));
  }, [orgId]);

  return { runs, refresh };
}
