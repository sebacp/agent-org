import { useCallback, useState, type CSSProperties } from "react";
import { useRouter } from "next/router";
import ContextPane, {
  type ContextTab,
} from "@/components/workspace/ContextPane";
import Conversation from "@/components/workspace/Conversation";
import FileViewer from "@/components/workspace/FileViewer";
import ThreadRail from "@/components/workspace/ThreadRail";
import { useAutosave } from "@/hooks/useAutosave";
import { useFiles } from "@/hooks/useFiles";
import { useOrgEvents } from "@/hooks/useOrgEvents";
import { useOrgGraph } from "@/hooks/useOrgGraph";
import { useOrgRun } from "@/hooks/useOrgRun";
import { useTasks } from "@/hooks/useTasks";
import { useSources } from "@/hooks/useSources";
import { useThreads } from "@/hooks/useThreads";
import { DepartmentsProvider } from "@/lib/department-context";
import { RunStatusProvider } from "@/lib/run-context";
import { SourcesProvider } from "@/lib/source-context";
import type { Thread } from "@/lib/run-types";
import type { PendingTask } from "@/lib/task-types";

export default function Workspace({ orgId }: { orgId: string }) {
  const router = useRouter();
  const org = useOrgGraph(orgId);
  useAutosave(orgId, org.company, org.departments, org.nodes, org.edges);
  const run = useOrgRun(
    orgId,
    org.company,
    org.departments,
    org.nodes,
    org.edges,
  );
  const threads = useThreads(orgId);
  const files = useFiles(orgId);
  const tasks = useTasks(orgId);
  const sources = useSources(orgId);

  useOrgEvents(orgId, (topic) => {
    if (topic === "files") void files.refresh();
    else void tasks.refresh();
  });

  const [tab, setTab] = useState<ContextTab>("org");
  const [paneOpen, setPaneOpen] = useState(false);
  /** Zero until the divider is dragged, and a third of the window until then. */
  const [chatWidth, setChatWidth] = useState(0);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [openFileId, setOpenFileId] = useState<string | null>(null);

  // What the agents file or leave pending arrives on its own while the run is
  // still going; the thread itself is only written once it ends.
  const start = useCallback(
    async (task: string, fromId?: string) => {
      setThreadId(null);
      await run.start(task, fromId);
      await threads.refresh();
    },
    [run, threads],
  );

  const attachToTask = useCallback(
    async (task: PendingTask, file: File) => {
      const meta = await tasks.attach(task, file);
      await files.refresh();
      return meta;
    },
    [files, tasks],
  );

  const resumeTask = useCallback(
    (task: PendingTask) => {
      setTab("tasks");
      void start(
        [
          `Retomá el pendiente ${task.id}: ${task.title}`,
          `Faltaba esto:\n${task.need}`,
          task.answer ? `Ya lo tenés:\n${task.answer}` : null,
          task.attachments.length
            ? `Te dejaron estos archivos en la biblioteca, leelos con leer_archivo:\n${task.attachments
                .map((f) => `- ${f.title} (id ${f.id})`)
                .join("\n")}`
            : null,
          "Hacé el trabajo con eso y cerrá el pendiente.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        task.agentId,
      );
    },
    [start],
  );

  const openThread = useCallback(
    (thread: Thread) => {
      setThreadId(thread.id);
      run.show(thread);
    },
    [run],
  );

  const newThread = useCallback(() => {
    setThreadId(null);
    run.clear();
  }, [run]);

  // Pointer events keep tracking outside the handle, which a drag needs once
  // the cursor runs ahead of the divider.
  const startResize = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    const move = (e: PointerEvent) => {
      const width = window.innerWidth - e.clientX;
      setChatWidth(Math.min(Math.max(width, 320), window.innerWidth - 420));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }, []);

  return (
    <DepartmentsProvider value={org.departments}>
      <SourcesProvider value={sources.sources}>
        <RunStatusProvider value={run.statuses}>
          <div className="flex h-screen flex-col bg-canvas">
            {/* The rail carries this once there is room for it. */}
            <header className="flex items-center gap-3 border-b border-hairline bg-chrome px-4 py-2.5 md:hidden">
              <button
                type="button"
                onClick={() => void router.push("/")}
                className="text-[12px] text-faint transition-colors hover:text-ink"
              >
                ‹ Empresas
              </button>
              <span className="min-w-0 truncate text-[14px] font-medium text-ink">
                {org.company.name || "Sin nombre"}
              </span>
              <button
                type="button"
                onClick={() => setPaneOpen(true)}
                className="ml-auto text-[12px] text-faint transition-colors hover:text-ink"
              >
                Contexto
              </button>
            </header>

            <div
              style={
                {
                  "--chat": chatWidth ? `${chatWidth}px` : "33.333%",
                } as CSSProperties
              }
              className="flex min-h-0 flex-1"
            >
              <ThreadRail
                companyName={org.company.name}
                threads={threads.threads}
                activeId={threadId}
                fileCount={files.files.length}
                filesOpen={tab === "files"}
                blockedCount={
                  tasks.tasks.filter((t) => t.state === "blocked").length
                }
                tasksOpen={tab === "tasks"}
                onNew={newThread}
                onOpen={openThread}
                onRemove={threads.remove}
                onLibrary={() => void router.push("/")}
                orgOpen={tab === "org"}
                onOrg={() => {
                  setTab("org");
                  setPaneOpen(true);
                }}
                onFiles={() => {
                  setTab("files");
                  setPaneOpen(true);
                }}
                onTasks={() => {
                  setTab("tasks");
                  setPaneOpen(true);
                }}
              />

              <ContextPane
                tab={tab}
                onTab={setTab}
                open={paneOpen}
                onClose={() => setPaneOpen(false)}
                nodes={org.nodes}
                edges={org.edges}
                onNodesChange={org.onNodesChange}
                onEdgesChange={org.onEdgesChange}
                onConnect={org.onConnect}
                results={run.results}
                spend={run.spend}
                files={files.files}
                query={files.query}
                onQuery={files.setQuery}
                onOpenFile={setOpenFileId}
                onRemoveFile={(id) => void files.remove(id)}
                tasks={tasks.tasks}
                onAnswerTask={(id, text, attachments) =>
                  void tasks.answer(id, text, attachments)
                }
                onAttachToTask={attachToTask}
                onResumeTask={resumeTask}
                onRemoveTask={(id) => void tasks.remove(id)}
                onEdit={() => void router.push(`/org/${orgId}/editar`)}
              />

              <div
                role="separator"
                aria-orientation="vertical"
                onPointerDown={startResize}
                className="relative hidden w-px shrink-0 cursor-col-resize bg-hairline transition-colors hover:bg-faint active:bg-faint lg:block"
              >
                {/* The seam is the line itself; a line is too thin to grab, so
                  the handle reaches past it on both sides. */}
                <span className="absolute inset-y-0 -right-1 -left-1" />
              </div>

              <Conversation
                companyName={org.company.name}
                task={run.task}
                trace={run.trace}
                usage={run.usage}
                answer={run.answer}
                error={run.error}
                running={run.running}
                onStart={(task) => void start(task)}
                onStop={run.stop}
              />
            </div>

            {openFileId ? (
              <FileViewer
                orgId={orgId}
                fileId={openFileId}
                onClose={() => setOpenFileId(null)}
              />
            ) : null}
          </div>
        </RunStatusProvider>
      </SourcesProvider>
    </DepartmentsProvider>
  );
}
