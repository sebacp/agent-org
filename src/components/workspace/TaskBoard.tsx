import { useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import type { PendingTask, TaskAttachment } from "@/lib/task-types";

const WHEN = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
});

const FULL_WHEN = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function whenLabel(iso: string, full = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return (full ? FULL_WHEN : WHEN).format(date);
}

/** Same shape as a `secondary` Button, for the label a file input needs. */
const UPLOAD =
  "inline-flex cursor-pointer items-center rounded-md border border-hairline bg-panel px-2.5 py-1 text-[13px] text-ink transition-colors hover:bg-raised";

const EMPTY: Record<"inbox" | "done", string> = {
  inbox:
    "Bandeja vacía. Cuando a un agente le falte un dato o un acceso te va a escribir acá en vez de inventarlo.",
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
  const [showing, setShowing] = useState<"inbox" | "done">("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Opening a message is what loads the composer, the way a reply box comes up
  // already holding whatever draft was left in it.
  const open = (task: PendingTask) => {
    setOpenId(task.id);
    setDraft(task.answer);
    setAttached(task.attachments);
    setFailure(null);
  };

  const send = (task: PendingTask) => {
    if (draft.trim() || attached.length) {
      onAnswer(task.id, draft.trim(), attached);
    }
    setOpenId(null);
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
  const inbox = tasks.filter((t) => t.state !== "done");
  const unread = tasks.filter((t) => t.state === "blocked").length;
  const visible = showing === "done" ? done : inbox;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 border-b border-hairline px-3 py-2.5">
        {(
          [
            ["inbox", "Recibidos", inbox.length],
            ["done", "Resueltos", done.length],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setShowing(id);
              setOpenId(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
              showing === id
                ? "bg-raised text-ink"
                : "text-dim hover:bg-raised/60 hover:text-ink"
            }`}
          >
            {label} · {count}
            {id === "inbox" && unread ? (
              <span className="ml-1.5 inline-block size-1.5 rounded-full bg-warn align-[2px]" />
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-6 py-8 text-[13px] leading-relaxed text-faint">
            {EMPTY[showing]}
          </p>
        ) : null}

        {visible.map((task) => {
          const reading = openId === task.id;
          // Unanswered is the unread one: it is the only state where the
          // company is stopped waiting on something only you have.
          const unanswered = task.state === "blocked";

          return (
            <article
              key={task.id}
              className={`group relative border-b border-hairline transition-colors ${
                reading ? "bg-raised/40" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => (reading ? setOpenId(null) : open(task))}
                className="flex w-full items-start gap-2.5 px-4 py-3 text-left"
              >
                <Avatar seed={task.agentId} size={26} className="mt-px" />

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`min-w-0 flex-1 truncate text-[13px] ${
                        unanswered ? "font-medium text-ink" : "text-dim"
                      }`}
                    >
                      {task.author || "Un agente"}
                      {task.area ? (
                        <span className="text-faint"> · {task.area}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[12px] text-faint">
                      {whenLabel(task.createdAt)}
                    </span>
                  </span>

                  <span
                    className={`mt-0.5 block truncate text-[13px] leading-snug ${
                      unanswered ? "text-ink" : "text-dim"
                    }`}
                  >
                    {task.title}
                  </span>

                  {/* The preview line, which is what an inbox is for: enough of
                    the body to know whether this one needs you now. */}
                  {reading ? null : (
                    <span className="mt-0.5 block truncate text-[13px] text-faint">
                      {task.answer || task.need}
                    </span>
                  )}
                </span>

                {unanswered ? (
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
                ) : null}
              </button>

              <button
                type="button"
                aria-label="Borrar mensaje"
                onClick={() => onRemove(task.id)}
                className="absolute right-3 bottom-2 text-[13px] text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
              >
                ×
              </button>

              {reading ? (
                <div className="px-4 pb-3 pl-[58px]">
                  <p className="text-[12px] text-faint">
                    {whenLabel(task.createdAt, true)}
                  </p>

                  {/* What it was for. A "falta el token de staging" is
                    unanswerable without knowing what it was needed for. */}
                  {task.assignment ? (
                    <p className="mt-2 border-l border-hairline pl-2.5 text-[12px] leading-relaxed text-faint">
                      {task.assignment}
                    </p>
                  ) : null}

                  <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-line text-dim">
                    {task.need}
                  </p>

                  {task.state === "done" ? (
                    <>
                      <p className="mt-3 border-l border-hairline pl-2.5 text-[13px] leading-relaxed whitespace-pre-line text-dim">
                        {task.answer}
                      </p>
                      <Chips files={task.attachments} onOpenFile={onOpenFile} />
                    </>
                  ) : (
                    <div className="mt-3">
                      <textarea
                        autoFocus
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        rows={3}
                        placeholder="Respondele…"
                        className="w-full resize-none rounded-lg border border-hairline bg-panel px-2.5 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-faint"
                      />

                      {attached.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {attached.map((file) => (
                            <span
                              key={file.id}
                              className="flex max-w-full items-center gap-1 rounded-md border border-hairline px-1.5 py-0.5 text-[12px] text-dim"
                            >
                              <span className="truncate">{file.title}</span>
                              <button
                                type="button"
                                aria-label="Quitar adjunto"
                                onClick={() =>
                                  setAttached((current) =>
                                    current.filter((a) => a.id !== file.id),
                                  )
                                }
                                className="text-faint transition-colors hover:text-danger"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {failure ? (
                        <p className="mt-1.5 text-[12px] text-danger">
                          {failure}
                        </p>
                      ) : null}

                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => send(task)}
                        >
                          {task.answer ? "Guardar" : "Responder"}
                        </Button>
                        <label className={UPLOAD}>
                          {uploading ? "Subiendo…" : "Adjuntar"}
                          <input
                            type="file"
                            accept=".csv,.tsv,.txt,.md,.json,.yaml,.yml,.log,text/*"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              void pick(task, file);
                            }}
                          />
                        </label>
                        {/* Answering files the message; the corrida it stopped
                          is a separate one, and only this starts it again. */}
                        {task.state === "open" ? (
                          <Button size="sm" onClick={() => onResume(task)}>
                            Retomar
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Chips({
  files,
  onOpenFile,
}: {
  files: TaskAttachment[];
  onOpenFile: (fileId: string) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5 pl-2.5">
      {files.map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={() => onOpenFile(file.id)}
          className="max-w-full truncate rounded-md border border-hairline px-1.5 py-0.5 text-[12px] text-dim transition-colors hover:border-faint hover:text-ink"
        >
          {file.title}
        </button>
      ))}
    </div>
  );
}
