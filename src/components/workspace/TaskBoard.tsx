import { useState } from "react";
import type { PendingTask } from "@/lib/task-types";

const MARK: Record<PendingTask["state"], string> = {
  blocked: "border-ink/40",
  open: "border-ink/40 bg-ink/40",
  done: "border-faint bg-faint",
};

const LABEL: Record<PendingTask["state"], string> = {
  blocked: "esperando tu respuesta",
  open: "listo para retomar",
  done: "resuelto",
};

interface TaskBoardProps {
  tasks: PendingTask[];
  onAnswer: (id: string, text: string) => void;
  onResume: (task: PendingTask) => void;
  onRemove: (id: string) => void;
}

export default function TaskBoard({
  tasks,
  onAnswer,
  onResume,
  onRemove,
}: TaskBoardProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const open = (task: PendingTask) => {
    setEditing(task.id);
    setDraft(task.answer);
  };

  const save = (id: string) => {
    if (draft.trim()) onAnswer(id, draft.trim());
    setEditing(null);
  };

  if (tasks.length === 0) {
    return (
      <p className="px-3 py-8 text-[12px] leading-relaxed text-faint">
        Nada trabado. Cuando a un agente le falte un dato o un acceso lo va a
        anotar acá en vez de inventarlo.
      </p>
    );
  }

  return (
    <div className="p-3">
      {tasks.map((task) => (
        <div key={task.id} className="group relative px-3 py-3">
          <span
            className={`absolute top-4 left-0 size-1.5 rounded-full border ${MARK[task.state]}`}
          />
          <p
            className={`pr-5 text-[13px] leading-snug ${
              task.state === "done" ? "text-faint line-through" : "text-ink"
            }`}
          >
            {task.title}
          </p>
          <p className="mt-0.5 text-[11px] text-faint">
            {[task.author, task.area, LABEL[task.state]]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <button
            type="button"
            aria-label="Borrar pendiente"
            onClick={() => onRemove(task.id)}
            className="absolute top-2.5 right-0 text-[13px] text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-700 focus:opacity-100"
          >
            ×
          </button>

          {task.state === "done" ? null : (
            <p className="mt-2 text-[12px] leading-relaxed whitespace-pre-line text-dim">
              {task.need}
            </p>
          )}

          {task.answer && editing !== task.id ? (
            <p className="mt-2 border-l border-hairline pl-2.5 text-[12px] leading-relaxed whitespace-pre-line text-dim">
              {task.answer}
            </p>
          ) : null}

          {editing === task.id ? (
            <div className="mt-2">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Lo que te pidieron, o dónde encontrarlo."
                className="w-full resize-none rounded-lg border border-hairline bg-panel px-2.5 py-2 text-[12px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-faint"
              />
              <div className="mt-1.5 flex gap-3 text-[12px]">
                <button
                  type="button"
                  onClick={() => save(task.id)}
                  className="text-ink transition-colors hover:text-dim"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-faint transition-colors hover:text-ink"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex gap-3 text-[12px]">
              {task.state === "done" ? null : (
                <button
                  type="button"
                  onClick={() => open(task)}
                  className="text-faint transition-colors hover:text-ink"
                >
                  {task.answer ? "Editar respuesta" : "Contestar"}
                </button>
              )}
              {task.state === "open" ? (
                <button
                  type="button"
                  onClick={() => onResume(task)}
                  className="text-ink transition-colors hover:text-dim"
                >
                  Retomar
                </button>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
