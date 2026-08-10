import { useState } from "react";
import type { PendingTask, TaskAttachment } from "@/lib/task-types";

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

const EMPTY: Record<"pending" | "done", string> = {
  pending:
    "Nada trabado. Cuando a un agente le falte un dato o un acceso lo va a anotar acá en vez de inventarlo.",
  done: "Todavía no se resolvió ninguno.",
};

interface TaskBoardProps {
  tasks: PendingTask[];
  onAnswer: (id: string, text: string, attachments: TaskAttachment[]) => void;
  onAttach: (task: PendingTask, file: File) => Promise<TaskAttachment>;
  onOpenFile: (fileId: string) => void;
  onResume: (task: PendingTask) => void;
  onRemove: (id: string) => void;
}

export default function TaskBoard({
  tasks,
  onAnswer,
  onAttach,
  onOpenFile,
  onResume,
  onRemove,
}: TaskBoardProps) {
  const [showing, setShowing] = useState<"pending" | "done">("pending");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const open = (task: PendingTask) => {
    setEditing(task.id);
    setDraft(task.answer);
    setAttached(task.attachments);
    setFailure(null);
  };

  const save = (id: string) => {
    if (draft.trim() || attached.length) {
      onAnswer(id, draft.trim(), attached);
    }
    setEditing(null);
  };

  const pick = async (task: PendingTask, file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setFailure(null);
    try {
      const meta = await onAttach(task, file);
      setAttached((current) => [...current, meta]);
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : "No pude subirlo.");
    } finally {
      setUploading(false);
    }
  };

  const done = tasks.filter((t) => t.state === "done");
  const pending = tasks.filter((t) => t.state !== "done");
  const visible = showing === "done" ? done : pending;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 border-b border-hairline px-3 py-2.5">
        {(
          [
            ["pending", "Pendientes", pending.length],
            ["done", "Resueltas", done.length],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setShowing(id);
              setEditing(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
              showing === id
                ? "bg-raised text-ink"
                : "text-dim hover:bg-raised/60 hover:text-ink"
            }`}
          >
            {label}
            {count ? ` · ${count}` : ""}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <p className="px-3 py-8 text-[12px] leading-relaxed text-faint">
            {EMPTY[showing]}
          </p>
        ) : null}

        {visible.map((task) => (
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

            {/* What it was for. A "falta el token de staging" is unanswerable
              without knowing what the agent was trying to do with it. */}
            {task.assignment && task.state !== "done" ? (
              <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-faint">
                {task.assignment}
              </p>
            ) : null}
            {/* Resolved keeps the question: an answer alone says nothing. */}
            <p
              className={`mt-2 text-[12px] leading-relaxed whitespace-pre-line ${
                task.state === "done" ? "text-faint" : "text-dim"
              }`}
            >
              {task.need}
            </p>

            {task.answer && editing !== task.id ? (
              <p className="mt-2 border-l border-hairline pl-2.5 text-[12px] leading-relaxed whitespace-pre-line text-dim">
                {task.answer}
              </p>
            ) : null}

            {task.attachments.length > 0 && editing !== task.id ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {task.attachments.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => onOpenFile(file.id)}
                    className="max-w-full truncate rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-dim transition-colors hover:border-faint hover:text-ink"
                  >
                    {file.title}
                  </button>
                ))}
              </div>
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

                {attached.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {attached.map((file) => (
                      <span
                        key={file.id}
                        className="flex max-w-full items-center gap-1 rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-dim"
                      >
                        <span className="truncate">{file.title}</span>
                        <button
                          type="button"
                          aria-label="Quitar adjunto"
                          onClick={() =>
                            setAttached((c) => c.filter((a) => a.id !== file.id))
                          }
                          className="text-faint transition-colors hover:text-red-700"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                {failure ? (
                  <p className="mt-1.5 text-[11px] text-red-700">{failure}</p>
                ) : null}

                <div className="mt-1.5 flex gap-3 text-[12px]">
                  <label className="cursor-pointer text-faint transition-colors hover:text-ink">
                    {uploading ? "Subiendo…" : "Adjuntar"}
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,.md,.json,.yaml,.yml,.log,text/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        void pick(task, file);
                      }}
                    />
                  </label>
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
    </div>
  );
}
