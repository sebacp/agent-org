import { useEffect, useState } from "react";
import Icon, { type IconName } from "@/components/ui/Icon";
import SpendMeter from "@/components/workspace/SpendMeter";
import type { GuardState, Guards } from "@/lib/guard-types";
import type { ActiveRun, RunOrigin, Thread } from "@/lib/run-types";
import type { PendingTask } from "@/lib/task-types";

const WHEN = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
});

/** How often the elapsed labels are redrawn while something is running. */
const TICK_MS = 30_000;

const ORIGIN: Record<RunOrigin["kind"], string> = {
  manual: "vos",
  automation: "automatización",
  task: "pendiente",
};

function whenLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : WHEN.format(date);
}

/**
 * Coarser than a stopwatch on purpose: the clock it reads only moves once a
 * tick, and to the minute that lag never shows.
 */
function agoLabel(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function RailTab({
  icon,
  label,
  count,
  urgent = false,
  open,
  onClick,
}: {
  icon: IconName;
  label: string;
  /** Hidden when there is nothing to count, as with the organigrama. */
  count?: number;
  urgent?: boolean;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
        open ? "bg-raised text-ink" : "text-dim hover:bg-raised/60 hover:text-ink"
      }`}
    >
      <span className={open ? "text-dim" : "text-faint"}>
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {count === undefined ? null : (
        <span className={`text-[12px] ${urgent ? "text-ink" : "text-faint"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

interface ThreadRailProps {
  companyName: string;
  threads: Thread[];
  activeId: string | null;
  /** What the company is doing right now, whoever set it off. */
  runs: ActiveRun[];
  fileCount: number;
  filesOpen: boolean;
  /** Only the ones waiting on you; the rest need no nudge. */
  blocked: PendingTask[];
  tasksOpen: boolean;
  /** Only the ones still armed; a paused one is not going to wake up. */
  automationCount: number;
  automationsOpen: boolean;
  /** The tope and what the month has spent against it. */
  guards: GuardState;
  onGuards: (patch: Partial<Guards>) => void;
  onNew: () => void;
  onOpen: (thread: Thread) => void;
  /** Follows a corrida that is still going, wherever it was set off. */
  onOpenRun: (run: ActiveRun) => void;
  onRemove: (id: string) => void;
  onLibrary: () => void;
  onOrg: () => void;
  orgOpen: boolean;
  onFiles: () => void;
  onTasks: () => void;
  onAutomations: () => void;
}

export default function ThreadRail({
  companyName,
  threads,
  activeId,
  runs,
  fileCount,
  filesOpen,
  blocked,
  tasksOpen,
  automationCount,
  automationsOpen,
  guards,
  onGuards,
  onNew,
  onOpen,
  onOpenRun,
  onRemove,
  onLibrary,
  onOrg,
  orgOpen,
  onFiles,
  onTasks,
  onAutomations,
}: ThreadRailProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const busy = runs.length > 0 || blocked.length > 0;

  // A quiet rail redraws nothing; while something runs the clock advances once
  // a tick, and the labels below are coarse enough that the lag never shows.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (runs.length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [runs.length]);

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

      {/* Above the thread list: the pane these open is the thing you came to
          see, and it shouldn't drift down as the list grows. */}
      <nav className="mt-3 px-3 pb-3">
        <RailTab
          icon="org"
          label="Organigrama"
          open={orgOpen}
          onClick={onOrg}
        />
        <RailTab
          icon="tasks"
          label="Pendientes"
          count={blocked.length}
          urgent={blocked.length > 0}
          open={tasksOpen}
          onClick={onTasks}
        />
        <RailTab
          icon="library"
          label="Biblioteca"
          count={fileCount}
          open={filesOpen}
          onClick={onFiles}
        />
        <RailTab
          icon="automations"
          label="Automatizaciones"
          count={automationCount}
          open={automationsOpen}
          onClick={onAutomations}
        />
      </nav>

      <nav className="min-h-0 flex-1 overflow-y-auto border-t border-hairline px-3 py-3">
        {busy ? (
          <>
            <p className="px-3 pb-1 text-[10px] tracking-wide text-faint uppercase">
              Ahora
            </p>

            {runs.map((run) => (
              <button
                key={run.threadId}
                type="button"
                onClick={() => onOpenRun(run)}
                className={`relative block w-full rounded-lg px-3 py-2 pl-6 text-left transition-colors ${
                  activeId === run.threadId
                    ? "bg-raised"
                    : "hover:bg-raised/60"
                }`}
              >
                <span className="absolute top-[13px] left-3 size-1.5 animate-pulse rounded-full bg-ink/50" />
                <span className="block truncate text-[13px] leading-snug text-ink">
                  {run.origin.label || run.title}
                </span>
                <span className="mt-0.5 block text-[11px] text-faint">
                  {ORIGIN[run.origin.kind]} · {agoLabel(run.startedAt, now)}
                </span>
              </button>
            ))}

            {/* A trabado is the only thing here that needs you rather than the
              company, so it goes to the pane that lets you answer it. */}
            {blocked.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={onTasks}
                className="relative block w-full rounded-lg px-3 py-2 pl-6 text-left transition-colors hover:bg-raised/60"
              >
                {/* The one bit of color in the rail: the dot is what says this
                  one stopped and is not going to start again on its own. */}
                <span className="absolute top-[13px] left-3 size-1.5 rounded-full bg-warn" />
                <span className="block truncate text-[13px] leading-snug text-ink">
                  {task.title}
                </span>
                <span className="mt-0.5 block text-[11px] text-faint">
                  te está esperando
                </span>
              </button>
            ))}

            <p className="px-3 pt-4 pb-1 text-[10px] tracking-wide text-faint uppercase">
              Antes
            </p>
          </>
        ) : null}

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
              {/* An automation or a retomada names itself; only a pedido you
                typed has nothing better than its own first words. */}
              <span className="block truncate text-[13px] leading-snug">
                {thread.origin?.label || thread.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-faint">
                {[
                  ORIGIN[thread.origin?.kind ?? "manual"],
                  whenLabel(thread.createdAt),
                  // How long the conversation got, which only says something
                  // once it went past the pedido that opened it.
                  thread.turns.length > 1
                    ? `${thread.turns.length} pedidos`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>

            {confirmId === thread.id ? (
              <button
                type="button"
                onClick={() => {
                  onRemove(thread.id);
                  setConfirmId(null);
                }}
                className="absolute top-2 right-2 text-[11px] text-danger"
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

      <SpendMeter guards={guards} onSave={onGuards} />
    </aside>
  );
}
