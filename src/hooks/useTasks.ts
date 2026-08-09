import { useCallback, useEffect, useState } from "react";
import { answerTask, fetchTasks, removeTask } from "@/lib/api";
import type { PendingTask } from "@/lib/task-types";

function load(orgId: string): Promise<PendingTask[]> {
  return fetchTasks(orgId).catch(() => []);
}

export function useTasks(orgId: string) {
  const [tasks, setTasks] = useState<PendingTask[]>([]);

  useEffect(() => {
    let live = true;
    void load(orgId).then((list) => {
      if (live) setTasks(list);
    });
    return () => {
      live = false;
    };
  }, [orgId]);

  const refresh = useCallback(async () => {
    setTasks(await load(orgId));
  }, [orgId]);

  const answer = useCallback(
    async (id: string, text: string) => {
      const updated = await answerTask(orgId, id, text);
      setTasks((current) =>
        current.map((t) => (t.id === id ? updated : t)),
      );
    },
    [orgId],
  );

  const remove = useCallback(
    async (id: string) => {
      setTasks((current) => current.filter((t) => t.id !== id));
      await removeTask(orgId, id).catch(() => undefined);
    },
    [orgId],
  );

  return { tasks, refresh, answer, remove };
}
