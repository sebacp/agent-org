import { useCallback, useEffect, useState } from "react";
import { answerTask, fetchTasks, removeTask, uploadFile } from "@/lib/api";
import type { PendingTask, TaskAttachment } from "@/lib/task-types";

/** The library stores plain text, and the JSON body has to fit in one request. */
const MAX_UPLOAD_CHARS = 10_000_000;
const TEXT_FILE = /\.(csv|tsv|txt|md|json|ya?ml|log|html?)$/i;

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
    async (id: string, text: string, attachments: TaskAttachment[]) => {
      const updated = await answerTask(orgId, id, text, attachments);
      setTasks((current) =>
        current.map((t) => (t.id === id ? updated : t)),
      );
    },
    [orgId],
  );

  const attach = useCallback(
    async (task: PendingTask, file: File): Promise<TaskAttachment> => {
      if (!file.type.startsWith("text/") && !TEXT_FILE.test(file.name)) {
        throw new Error("Solo texto: csv, txt, md, json.");
      }
      const content = await file.text();
      if (content.length > MAX_UPLOAD_CHARS) {
        throw new Error("El archivo pasa los 10 MB. Recortalo o subí un resumen.");
      }
      const meta = await uploadFile(orgId, {
        title: file.name,
        content,
        area: task.area,
      });
      return { id: meta.id, title: meta.title };
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

  return { tasks, refresh, answer, attach, remove };
}
