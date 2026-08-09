import { useCallback, useEffect, useState } from "react";
import { fetchThreads, removeThread } from "@/lib/api";
import type { Thread } from "@/lib/run-types";

function load(orgId: string): Promise<Thread[]> {
  return fetchThreads(orgId).catch(() => []);
}

export function useThreads(orgId: string) {
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    let live = true;
    void load(orgId).then((list) => {
      if (live) setThreads(list);
    });
    return () => {
      live = false;
    };
  }, [orgId]);

  const refresh = useCallback(async () => {
    setThreads(await load(orgId));
  }, [orgId]);

  const remove = useCallback(
    async (id: string) => {
      setThreads((current) => current.filter((t) => t.id !== id));
      await removeThread(orgId, id).catch(() => undefined);
    },
    [orgId],
  );

  return { threads, refresh, remove };
}
