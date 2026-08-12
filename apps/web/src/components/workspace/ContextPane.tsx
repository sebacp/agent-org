import { useEffect, useRef, useState } from "react";
import {
  useReactFlow,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import OrgCanvas from "@/components/canvas/OrgCanvas";
import Avatar from "@/components/ui/Avatar";
import Icon, { type IconName } from "@/components/ui/Icon";
import Markdown from "@/components/ui/Markdown";
import AutomationBoard from "@/components/workspace/AutomationBoard";
import SecurityBoard from "@/components/workspace/SecurityBoard";
import TaskBoard from "@/components/workspace/TaskBoard";
import { fileThumbUrl } from "@/lib/api";
import type { Automation, AutomationDraft } from "@agent-org/shared/automation-types";
import {
  folderKey,
  isDataset,
  isImage,
  type FileMeta,
} from "@agent-org/shared/file-types";
import type { GuardState, Guards } from "@agent-org/shared/guard-types";
import type { PendingTask, TaskAttachment } from "@agent-org/shared/task-types";
import type { AgentNode, OrgEdge } from "@agent-org/shared/types";
import {
  formatCost,
  formatTokens,
  totalTokens,
  type RunUsage,
} from "@agent-org/shared/usage";

export type ContextTab = "org" | "tasks" | "files" | "automations" | "security";

const TABS = [
  ["org", "Organigrama"],
  ["tasks", "Inbox"],
  ["files", "Biblioteca"],
  ["automations", "Automatizaciones"],
  ["security", "Seguridad"],
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

const EXT: Record<string, IconName> = {
  csv: "table",
  tsv: "table",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  json: "attachment",
  yaml: "attachment",
  yml: "attachment",
  log: "attachment",
  txt: "attachment",
  md: "attachment",
};

/**
 * What came down a link knows what it is. Past that, only what you upload keeps
 * an extension: an agent titles its work in prose, and what it writes is always
 * a document.
 */
function fileIcon(file: FileMeta): IconName {
  if (isImage(file)) return "image";
  if (isDataset(file)) return "table";
  const ext = file.title.toLowerCase().split(".").pop() ?? "";
  return EXT[ext] ?? (file.mime ? "attachment" : "doc");
}

/**
 * The shelf at one level: the folders that open from here, and the files that
 * were left here rather than inside one of them. Nothing is stored about a
 * folder anywhere — it is only the paths the files carry, read one segment at a
 * time — so an empty one cannot exist and never has to be cleaned up.
 */
function shelfAt(files: FileMeta[], at: string) {
  const here = at ? `${at}/` : "";
  const folders = new Map<string, { name: string; files: number }>();
  const loose: FileMeta[] = [];

  for (const file of files) {
    const path = file.folder ?? "";
    if (folderKey(path) === folderKey(at)) {
      loose.push(file);
      continue;
    }
    if (at && !folderKey(path).startsWith(folderKey(here))) continue;
    const name = path.slice(here.length).split("/")[0];
    if (!name) continue;
    const found = folders.get(folderKey(name)) ?? { name, files: 0 };
    found.files += 1;
    folders.set(folderKey(name), found);
  }

  return {
    folders: [...folders.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "es"),
    ),
    loose,
  };
}

/**
 * What the row leads with. An image gets shown rather than named, because a
 * CDN calls it `e22a5d95-291b-429c.jpg` and no title tells you which one it is.
 */
function FileMark({ orgId, file }: { orgId: string; file: FileMeta }) {
  // A format the thumbnailer can't read — an SVG, a truncated download — falls
  // back to the icon the list drew before there were thumbnails.
  const [flat, setFlat] = useState(false);

  return isImage(file) && !flat ? (
    // eslint-disable-next-line @next/next/no-img-element -- it comes off our own disk already sized
    <img
      src={fileThumbUrl(orgId, file.id)}
      alt=""
      onError={() => setFlat(true)}
      className="size-9 shrink-0 rounded-md border border-hairline bg-raised object-cover"
    />
  ) : (
    <span className="mt-0.5 text-faint">
      <Icon name={fileIcon(file)} />
    </span>
  );
}

interface ContextPaneProps {
  orgId: string;
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
  automations: Automation[];
  /** Names of the automations with a corrida going, whoever set it off. */
  runningAutomations: string[];
  onCreateAutomation: (draft: AutomationDraft) => Promise<void>;
  onSaveAutomation: (
    id: string,
    patch: Partial<AutomationDraft>,
  ) => Promise<void>;
  onRunAutomation: (id: string) => Promise<void>;
  onRemoveAutomation: (id: string) => void;
  guards: GuardState;
  onGuards: (patch: Partial<Guards>) => void;
  onRevokeGrant: (sourceId: string, tool: string) => void;
  onOpenThread: (threadId: string) => void;
  onEdit: () => void;
}

export default function ContextPane({
  orgId,
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
  automations,
  runningAutomations,
  onCreateAutomation,
  onSaveAutomation,
  onRunAutomation,
  onRemoveAutomation,
  guards,
  onGuards,
  onRevokeGrant,
  onOpenThread,
  onEdit,
}: ContextPaneProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  /** Which shelf of the library is open. "" is the root. */
  const [folder, setFolder] = useState("");
  // A search reads the whole library, so while there is one the folders step
  // aside: what you are looking for is usually the thing you can't find.
  const searching = query.trim().length > 0;
  const shelf = shelfAt(files, folder);
  const crumbs = folder.split("/").filter(Boolean);
  const blocked = tasks.filter((t) => t.state === "blocked").length;
  const agentOptions = nodes.map((node) => ({
    id: node.id,
    label: node.data.role || node.data.name || "Sin rol",
  }));
  // A file records who wrote it by role, and the face on the chart is seeded by
  // node id, so the library needs the way back from one to the other.
  const byRole: Record<string, string> = {};
  for (const node of nodes) {
    if (node.data.role) byRole[node.data.role] ??= node.id;
  }
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
          className="fixed inset-0 z-30 bg-scrim lg:hidden"
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
                {id === "automations" && automations.length
                  ? ` · ${automations.length}`
                  : ""}
                {id === "security" && guards.grants.length
                  ? ` · ${guards.grants.length}`
                  : ""}
              </button>
            ))}
          </div>
          <p className="hidden min-w-0 flex-1 truncate px-1 text-[13px] font-medium text-ink md:block">
            {TABS.find(([id]) => id === tab)?.[1]}
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="text-[13px] text-faint transition-colors hover:text-ink"
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
                  <p className="mt-1 text-[12px] text-faint">
                    {formatTokens(totalTokens(spend[selected.id]))} tokens ·{" "}
                    {formatCost(spend[selected.id].cost)}
                  </p>
                ) : null}
                {/* An answer comes back in markdown; instructions are typed by
                  hand and keep the line breaks their author put there. */}
                {results[selected.id] ? (
                  <Markdown className="mt-1.5 text-[13px] text-dim">
                    {results[selected.id]}
                  </Markdown>
                ) : (
                  <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-line text-dim">
                    {selected.data.instructions || "Sin instrucciones."}
                  </p>
                )}
              </div>
            ) : null}
          </>
        ) : tab === "tasks" ? (
          <TaskBoard
            tasks={tasks}
            onAnswer={onAnswerTask}
            onAttach={onAttachToTask}
            onOpenFile={onOpenFile}
            onResume={onResumeTask}
            onRemove={onRemoveTask}
          />
        ) : tab === "automations" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AutomationBoard
              automations={automations}
              runningNames={runningAutomations}
              agents={agentOptions}
              onCreate={onCreateAutomation}
              onSave={onSaveAutomation}
              onRun={onRunAutomation}
              onRemove={onRemoveAutomation}
              onOpenThread={onOpenThread}
            />
          </div>
        ) : tab === "security" ? (
          <SecurityBoard
            guards={guards}
            onSave={onGuards}
            onRevoke={onRevokeGrant}
          />
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

            {crumbs.length > 0 && !searching ? (
              <div className="flex items-center gap-1 border-b border-hairline px-4 py-2 text-[12px] text-faint">
                <button
                  type="button"
                  onClick={() => setFolder("")}
                  className="transition-colors hover:text-ink"
                >
                  Biblioteca
                </button>
                {crumbs.map((name, depth) => (
                  <span key={name} className="flex items-center gap-1">
                    <span>/</span>
                    {depth === crumbs.length - 1 ? (
                      <span className="text-ink">{name}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setFolder(crumbs.slice(0, depth + 1).join("/"))
                        }
                        className="transition-colors hover:text-ink"
                      >
                        {name}
                      </button>
                    )}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {searching
                ? null
                : shelf.folders.map((sub) => (
                    <button
                      key={sub.name}
                      type="button"
                      onClick={() =>
                        setFolder(folder ? `${folder}/${sub.name}` : sub.name)
                      }
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-raised/60"
                    >
                      <span className="text-faint">
                        <Icon name="folder" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                        {sub.name}
                      </span>
                      <span className="text-[12px] text-faint">
                        {sub.files}
                      </span>
                    </button>
                  ))}

              {(searching ? files : shelf.loose).map((file) => (
                <div key={file.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpenFile(file.id)}
                    className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 pr-7 text-left transition-colors hover:bg-raised/60"
                  >
                    <FileMark orgId={orgId} file={file} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">
                        {file.title}
                        {file.partial ? (
                          <span className="ml-1.5 align-[1px] text-[11px] tracking-wide text-warn uppercase">
                            incompleto
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-faint">
                        {/* The face of whoever wrote it. What you uploaded
                          yourself has no author on the chart, so it goes
                          without one. */}
                        {byRole[file.author] ? (
                          <Avatar seed={byRole[file.author]} size={14} />
                        ) : null}
                        <span className="truncate">
                          {[
                            file.author,
                            file.area,
                            // A search reads the whole library, so a result can
                            // come from anywhere: where it sits is half of what
                            // you learn by finding it.
                            searching ? file.folder : null,
                            whenLabel(file.createdAt),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Borrar archivo"
                    onClick={() => onRemoveFile(file.id)}
                    className="absolute top-2.5 right-2 text-[13px] text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* Nothing to show here, which is not the same as an empty
                library: a folder whose files all live in its subfolders has
                plenty in it and nothing of its own to list. */}
              {shelf.folders.length === 0 &&
              (searching ? files : shelf.loose).length === 0 ? (
                <p className="px-3 py-8 text-[13px] leading-relaxed text-faint">
                  {searching
                    ? "Nada con esa búsqueda."
                    : folder
                      ? "Esta carpeta quedó vacía."
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
