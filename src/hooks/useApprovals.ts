import { useCallback, useEffect, useState } from "react";
import { answerApproval, fetchApprovals } from "@/lib/api";
import type { PendingWrite } from "@/lib/guard-types";

/**
 * The writes parked waiting on a person. A corrida holds its tool call open
 * while this is on screen, so the list is polled off the same bus everything
 * else is: it appears the moment an agent asks, from whatever set it off.
 */
export function useApprovals(orgId: string) {
  const [approvals, setApprovals] = useState<PendingWrite[]>([]);

  const refresh = useCallback(async () => {
    setApprovals(await fetchApprovals(orgId).catch(() => []));
  }, [orgId]);

  useEffect(() => {
    let live = true;
    void fetchApprovals(orgId)
      .catch((): PendingWrite[] => [])
      .then((list) => {
        if (live) setApprovals(list);
      });
    return () => {
      live = false;
    };
  }, [orgId]);

  const answer = useCallback(
    async (id: string, ok: boolean, always = false) => {
      // Dropped here first: the corrida resumes the instant the server hears
      // it, and leaving the card up would invite a second press.
      setApprovals((list) => list.filter((write) => write.id !== id));
      await answerApproval(orgId, id, ok, always).catch(() => false);
    },
    [orgId],
  );

  return { approvals, answer, refresh };
}
