import { useCallback, useEffect, useState } from "react";
import {
  createAutomation,
  fetchAutomations,
  removeAutomation,
  runAutomationNow,
  saveAutomation,
} from "@/lib/api";
import type { Automation, AutomationDraft } from "@agent-org/shared/automation-types";

function load(orgId: string): Promise<Automation[]> {
  return fetchAutomations(orgId).catch(() => []);
}

export function useAutomations(orgId: string) {
  const [automations, setAutomations] = useState<Automation[]>([]);

  useEffect(() => {
    let live = true;
    void load(orgId).then((list) => {
      if (live) setAutomations(list);
    });
    return () => {
      live = false;
    };
  }, [orgId]);

  const refresh = useCallback(async () => {
    setAutomations(await load(orgId));
  }, [orgId]);

  const create = useCallback(
    async (draft: AutomationDraft) => {
      const made = await createAutomation(orgId, draft);
      setAutomations((current) => [made, ...current]);
    },
    [orgId],
  );

  const save = useCallback(
    async (id: string, patch: Partial<AutomationDraft>) => {
      const updated = await saveAutomation(orgId, id, patch);
      setAutomations((current) =>
        current.map((a) => (a.id === id ? updated : a)),
      );
    },
    [orgId],
  );

  const remove = useCallback(
    async (id: string) => {
      setAutomations((current) => current.filter((a) => a.id !== id));
      await removeAutomation(orgId, id).catch(() => undefined);
    },
    [orgId],
  );

  // The corrida happens on the server whether or not this tab waits for it; the
  // live stream is what actually refreshes the card when it lands.
  const run = useCallback(
    async (id: string) => {
      await runAutomationNow(orgId, id);
      await refresh();
    },
    [orgId, refresh],
  );

  return { automations, refresh, create, save, remove, run };
}
