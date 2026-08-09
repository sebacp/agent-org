import { useEffect, useState, type CSSProperties } from "react";
import {
  useReactFlow,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import OrgCanvas from "@/components/canvas/OrgCanvas";
import TaskBoard from "@/components/workspace/TaskBoard";
import type { FileMeta } from "@/lib/file-types";
import type { PendingTask } from "@/lib/task-types";
import type { AgentNode, OrgEdge } from "@/lib/types";

export type ContextTab = "org" | "tasks" | "files";

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
  /** Dragged width, applied only where the pane sits beside the conversation. */
  width: number;
  nodes: AgentNode[];
  edges: OrgEdge[];
  onNodesChange: OnNodesChange<AgentNode>;
  onEdgesChange: OnEdgesChange<OrgEdge>;
  onConnect: OnConnect;
  results: Record<string, string>;
  files: FileMeta[];
  query: string;
  onQuery: (value: string) => void;
  onOpenFile: (id: string) => void;
  onRemoveFile: (id: string) => void;
  tasks: PendingTask[];
  onAnswerTask: (id: string, text: string) => void;
  onResumeTask: (task: PendingTask) => void;
  onRemoveTask: (id: string) => void;
  onEdit: () => void;
}

export default function ContextPane({
  tab,
  onTab,
  open,
  onClose,
  width,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  results,
  files,
  query,
  onQuery,
  onOpenFile,
  onRemoveFile,
  tasks,
  onAnswerTask,
  onResumeTask,
  onRemoveTask,
  onEdit,
}: ContextPaneProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const pending = tasks.filter((t) => t.state !== "done").length;
  const { fitView } = useReactFlow();

  // The canvas is unmounted while the files tab is up, and dragging the pane
  // narrower would otherwise leave the org clipped, so it refits on both.
  useEffect(() => {
    if (tab !== "org") return;
    const frame = window.requestAnimationFrame(() => {
      void fitView({ padding: 0.08 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, tab, width]);

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
        style={{ "--pane": `${width}px` } as CSSProperties}
        className={`${
          open
            ? "fixed inset-y-0 right-0 z-40 flex w-[360px] max-w-[85vw]"
            : "hidden"
        } h-full shrink-0 flex-col border-l border-hairline bg-chrome lg:static lg:flex lg:w-[var(--pane)] lg:max-w-none`}
      >
        <header className="flex items-center gap-1 border-b border-hairline px-3 py-2.5">
        {(
          [
            ["org", "Organigrama"],
            ["tasks", `Pendientes${pending ? ` · ${pending}` : ""}`],
            ["files", `Archivos${files.length ? ` · ${files.length}` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
              tab === id
                ? "bg-raised text-ink"
                : "text-dim hover:bg-raised/60 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={onEdit}
          className="ml-auto text-[12px] text-faint transition-colors hover:text-ink"
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
          <div className="min-h-0 flex-1">
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
              <p className="text-[13px] font-medium text-ink">
                {selected.data.role || "Sin rol"}
                {selected.data.name ? ` · ${selected.data.name}` : ""}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed whitespace-pre-line text-dim">
                {results[selected.id] ??
                  selected.data.instructions ??
                  "Sin instrucciones."}
              </p>
            </div>
          ) : null}
        </>
      ) : tab === "tasks" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TaskBoard
            tasks={tasks}
            onAnswer={onAnswerTask}
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
