import { useEffect, useRef, useState } from "react";
import {
  useReactFlow,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import OrgCanvas from "@/components/canvas/OrgCanvas";
import Avatar from "@/components/ui/Avatar";
import Markdown from "@/components/ui/Markdown";
import TaskBoard from "@/components/workspace/TaskBoard";
import type { FileMeta } from "@/lib/file-types";
import type { PendingTask, TaskAttachment } from "@/lib/task-types";
import type { AgentNode, OrgEdge } from "@/lib/types";
import {
  formatCost,
  formatTokens,
  totalTokens,
  type RunUsage,
} from "@/lib/usage";

export type ContextTab = "org" | "tasks" | "files";

const TABS = [
  ["org", "Organigrama"],
  ["tasks", "Pendientes"],
  ["files", "Biblioteca"],
] as const;

const WHEN = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function whenLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : WHEN.format(date);
}

interface ContextPaneProps {
  tab: ContextTab;
  onTab: (tab: ContextTab) => void;
  /** Only meaningful below `lg`, where the pane becomes a drawer. */
  open: boolean;
  onClose: () => void;
  nodes: AgentNode[];
  edges: OrgEdge[];
  onNodesChange: OnNodesChange<AgentNode>;
  onEdgesChange: OnEdgesChange<OrgEdge>;
  onConnect: OnConnect;
  results: Record<string, string>;
  /** What each agent burned in the run on screen, keyed by agent id. */
  spend: Record<string, RunUsage>;
  files: FileMeta[];
  query: string;
  onQuery: (value: string) => void;
  onOpenFile: (id: string) => void;
  onRemoveFile: (id: string) => void;
  tasks: PendingTask[];
  onAnswerTask: (id: string, text: string, files: TaskAttachment[]) => void;
  onAttachToTask: (task: PendingTask, file: File) => Promise<TaskAttachment>;
  onResumeTask: (task: PendingTask) => void;
  onRemoveTask: (id: string) => void;
  onEdit: () => void;
}

export default function ContextPane({
  tab,
  onTab,
  open,
  onClose,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  results,
  spend,
  files,
  query,
  onQuery,
  onOpenFile,
  onRemoveFile,
  tasks,
  onAnswerTask,
  onAttachToTask,
  onResumeTask,
  onRemoveTask,
  onEdit,
}: ContextPaneProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const blocked = tasks.filter((t) => t.state === "blocked").length;
  const { fitView } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);

  // The pane keeps whatever the conversation leaves it, so its width moves with
  // the divider and with the window itself, and as a drawer it measures zero
  // until it opens. Watching the element covers all of that; React never sees
  // most of it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      void fitView({ padding: 0.08 });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [fitView, tab]);

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-ink/15 lg:hidden"
        />
      ) : null}

      <aside
        className={`${
          open
            ? "fixed inset-y-0 right-0 z-40 flex w-[360px] max-w-[85vw]"
            : "hidden"
        } h-full shrink-0 flex-col border-l border-hairline bg-chrome lg:static lg:flex lg:w-auto lg:max-w-none lg:min-w-0 lg:flex-1 lg:border-l-0`}
      >
        <header className="flex items-center gap-1 border-b border-hairline px-3 py-2.5">
          {/* The rail is the one place these live; this row only stands in for it
            on the widths that hide the rail. It wraps because tabs stop fitting
            one row once the pane is dragged narrow. */}
          <div className="flex min-w-0 flex-1 flex-wrap gap-1 md:hidden">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onTab(id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                  tab === id
                    ? "bg-raised text-ink"
                    : "text-dim hover:bg-raised/60 hover:text-ink"
                }`}
              >
                {label}
                {id === "tasks" && blocked ? ` · ${blocked}` : ""}
                {id === "files" && files.length ? ` · ${files.length}` : ""}
              </button>
            ))}
          </div>
          <p className="hidden min-w-0 flex-1 truncate px-1 text-[13px] font-medium text-ink md:block">
            {TABS.find(([id]) => id === tab)?.[1]}
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="text-[12px] text-faint transition-colors hover:text-ink"
          >
            Editar
          </button>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="pl-2 text-[15px] text-faint transition-colors hover:text-ink lg:hidden"
          >
            ×
          </button>
        </header>

        {tab === "org" ? (
          <>
            <div ref={canvasRef} className="min-h-0 flex-1">
              <OrgCanvas
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(id) =>
                  setSelectedId((current) => (current === id ? null : id))
                }
                compact
              />
            </div>

            {selected ? (
              <div className="max-h-[45%] overflow-y-auto border-t border-hairline px-4 py-3">
                <div className="flex items-center gap-2">
                  <Avatar seed={selected.id} size={24} />
                  <p className="min-w-0 flex-1 text-[13px] font-medium text-ink">
                    {selected.data.role || "Sin rol"}
                    {selected.data.name ? ` · ${selected.data.name}` : ""}
                  </p>
                </div>
                {spend[selected.id] ? (
                  <p className="mt-1 text-[11px] text-faint">
                    {formatTokens(totalTokens(spend[selected.id]))} tokens ·{" "}
                    {formatCost(spend[selected.id].cost)}
                  </p>
                ) : null}
                {/* An answer comes back in markdown; instructions are typed by
                  hand and keep the line breaks their author put there. */}
                {results[selected.id] ? (
                  <Markdown className="mt-1.5 text-[12px] text-dim">
                    {results[selected.id]}
                  </Markdown>
                ) : (
                  <p className="mt-1.5 text-[12px] leading-relaxed whitespace-pre-line text-dim">
                    {selected.data.instructions || "Sin instrucciones."}
                  </p>
                )}
              </div>
            ) : null}
          </>
        ) : tab === "tasks" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TaskBoard
              tasks={tasks}
              onAnswer={onAnswerTask}
              onAttach={onAttachToTask}
              onOpenFile={onOpenFile}
              onResume={onResumeTask}
              onRemove={onRemoveTask}
            />
          </div>
        ) : (
          <>
            <div className="border-b border-hairline px-3 py-2.5">
              <input
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder="Buscar en la biblioteca"
                className="w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-faint"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {files.map((file) => (
                <div key={file.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpenFile(file.id)}
                    className="w-full rounded-lg px-3 py-2.5 pr-7 text-left transition-colors hover:bg-raised/60"
                  >
                    <span className="block truncate text-[13px] text-ink">
                      {file.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-faint">
                      {[file.author, file.area, whenLabel(file.createdAt)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Borrar archivo"
                    onClick={() => onRemoveFile(file.id)}
                    className="absolute top-2.5 right-2 text-[13px] text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-700 focus:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}

              {files.length === 0 ? (
                <p className="px-3 py-8 text-[12px] leading-relaxed text-faint">
                  {query
                    ? "Nada con esa búsqueda."
                    : "Vacía por ahora. Los agentes guardan acá lo que vale la pena conservar."}
                </p>
              ) : null}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
