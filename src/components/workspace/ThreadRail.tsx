import { useState } from "react";
import type { Thread } from "@/lib/run-types";

const WHEN = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
});

function whenLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : WHEN.format(date);
}

interface ThreadRailProps {
  companyName: string;
  threads: Thread[];
  activeId: string | null;
  fileCount: number;
  filesOpen: boolean;
  /** Only the ones waiting on you; the rest need no nudge. */
  blockedCount: number;
  tasksOpen: boolean;
  onNew: () => void;
  onOpen: (thread: Thread) => void;
  onRemove: (id: string) => void;
  onLibrary: () => void;
  onOrg: () => void;
  orgOpen: boolean;
  onFiles: () => void;
  onTasks: () => void;
}

export default function ThreadRail({
  companyName,
  threads,
  activeId,
  fileCount,
  filesOpen,
  blockedCount,
  tasksOpen,
  onNew,
  onOpen,
  onRemove,
  onLibrary,
  onOrg,
  orgOpen,
  onFiles,
  onTasks,
}: ThreadRailProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <aside className="hidden h-full w-[248px] shrink-0 flex-col border-r border-hairline bg-chrome md:flex">
      <header className="px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={onLibrary}
          className="text-[12px] text-faint transition-colors hover:text-ink"
        >
          ‹ Empresas
        </button>
        <p className="mt-1.5 truncate text-[15px] font-medium text-ink">
          {companyName || "Sin nombre"}
        </p>
      </header>

      <div className="px-3">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-left text-[13px] text-dim transition-colors hover:border-faint hover:text-ink"
        >
          Nuevo pedido
        </button>
      </div>

      <nav className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {threads.map((thread) => (
          <div key={thread.id} className="group relative">
            <button
              type="button"
              onClick={() => onOpen(thread)}
              className={`w-full rounded-lg px-3 py-2 pr-7 text-left transition-colors ${
                activeId === thread.id
                  ? "bg-raised text-ink"
                  : "text-dim hover:bg-raised/60 hover:text-ink"
              }`}
            >
              <span className="block truncate text-[13px] leading-snug">
                {thread.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-faint">
                {whenLabel(thread.createdAt)}
                {thread.steps.length > 0
                  ? ` · ${thread.steps.length} pasos`
                  : ""}
              </span>
            </button>

            {confirmId === thread.id ? (
              <button
                type="button"
                onClick={() => {
                  onRemove(thread.id);
                  setConfirmId(null);
                }}
                className="absolute top-2 right-2 text-[11px] text-red-700"
              >
                Borrar
              </button>
            ) : (
              <button
                type="button"
                aria-label="Borrar hilo"
                onClick={() => setConfirmId(thread.id)}
                onBlur={() => setConfirmId(null)}
                className="absolute top-2 right-2 text-[13px] text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus:opacity-100"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {threads.length === 0 ? (
          <p className="px-3 py-6 text-[12px] leading-relaxed text-faint">
            Todavía no le pediste nada a la empresa.
          </p>
        ) : null}
      </nav>

      <footer className="border-t border-hairline p-3">
        {/* Between the rail appearing and the pane docking there is no other
            way in, and the organigrama is the thing you came to see. */}
        <button
          type="button"
          onClick={onOrg}
          className={`flex w-full items-center rounded-lg px-3 py-2 text-[13px] transition-colors ${
            orgOpen
              ? "bg-raised text-ink"
              : "text-dim hover:bg-raised/60 hover:text-ink"
          }`}
        >
          Organigrama
        </button>
        <button
          type="button"
          onClick={onTasks}
          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors ${
            tasksOpen
              ? "bg-raised text-ink"
              : "text-dim hover:bg-raised/60 hover:text-ink"
          }`}
        >
          <span>Pendientes</span>
          <span
            className={`text-[12px] ${blockedCount ? "text-ink" : "text-faint"}`}
          >
            {blockedCount}
          </span>
        </button>
        <button
          type="button"
          onClick={onFiles}
          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors ${
            filesOpen
              ? "bg-raised text-ink"
              : "text-dim hover:bg-raised/60 hover:text-ink"
          }`}
        >
          <span>Biblioteca</span>
          <span className="text-[12px] text-faint">{fileCount}</span>
        </button>
      </footer>
    </aside>
  );
}
