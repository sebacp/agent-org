import { useCallback, useState, type CSSProperties } from "react";
import { useRouter } from "next/router";
import ApprovalBar from "@/components/workspace/ApprovalBar";
import ContextPane, {
  type ContextTab,
} from "@/components/workspace/ContextPane";
import Conversation from "@/components/workspace/Conversation";
import FileViewer from "@/components/workspace/FileViewer";
import ThreadRail from "@/components/workspace/ThreadRail";
import { useActiveRuns } from "@/hooks/useActiveRuns";
import { useApprovals } from "@/hooks/useApprovals";
import { useAutomations } from "@/hooks/useAutomations";
import { useFiles } from "@/hooks/useFiles";
import { useGuards } from "@/hooks/useGuards";
import { useOrgEvents } from "@/hooks/useOrgEvents";
import { useOrgGraph } from "@/hooks/useOrgGraph";
import { useOrgMirror } from "@/hooks/useOrgMirror";
import { useOrgRun } from "@/hooks/useOrgRun";
import { useTasks } from "@/hooks/useTasks";
import { useSources } from "@/hooks/useSources";
import { useThreads } from "@/hooks/useThreads";
import { DepartmentsProvider } from "@/lib/department-context";
import { RunStatusProvider } from "@/lib/run-context";
import { SourcesProvider } from "@/lib/source-context";
import type { ActiveRun, RunOrigin, Thread } from "@/lib/run-types";
import type { PendingTask } from "@/lib/task-types";

export default function Workspace({ orgId }: { orgId: string }) {
  const router = useRouter();
  const org = useOrgGraph(orgId);
  useOrgMirror(orgId, org.company, org.departments, org.nodes, org.edges);
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
  const automations = useAutomations(orgId);
  const active = useActiveRuns(orgId);
  const guards = useGuards(orgId);
  const approvals = useApprovals(orgId);

  useOrgEvents(orgId, (topic) => {
    if (topic === "files") void files.refresh();
    else if (topic === "tasks") void tasks.refresh();
    else if (topic === "automations") void automations.refresh();
    else if (topic === "runs") void active.refresh();
    else if (topic === "guards") void guards.refresh();
    else if (topic === "approvals") void approvals.refresh();
    // A corrida that started on the server, so the hilo is new to this tab.
    else void threads.refresh();
  });

  const [tab, setTab] = useState<ContextTab>("org");
  const [paneOpen, setPaneOpen] = useState(false);
  /** Zero until the divider is dragged, and a third of the window until then. */
  const [chatWidth, setChatWidth] = useState(0);
  const [openFileId, setOpenFileId] = useState<string | null>(null);

  // What the agents file or leave pending arrives on its own while the run is
  // still going; the thread itself is only written once it ends.
  const start = useCallback(
    async (task: string, fromId?: string, origin?: RunOrigin) => {
      await run.start(task, fromId, origin);
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
          // Retomar is a corrida of its own, so the agent starts with no memory
          // of the one that got stuck: the encargo has to travel with the task.
          task.assignment
            ? `Esto era lo que estabas haciendo:\n${task.assignment}`
            : null,
          `Te faltaba esto:\n${task.need}`,
          task.answer ? `Te contestaron:\n${task.answer}` : null,
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
        { kind: "task", label: task.title },
      );
    },
    [start],
  );

  const openThread = useCallback((thread: Thread) => run.show(thread), [run]);

  // The same statuses the org chart paints itself with, so following a corrida
  // and watching it move across the chart are one thing.
  const openRun = useCallback((active: ActiveRun) => run.watch(active), [run]);

  // An automation's corrida happens on the server, so its hilo can be one this
  // tab never listed.
  const openThreadById = useCallback(
    async (id: string) => {
      const found =
        threads.threads.find((t) => t.id === id) ??
        (await threads.refresh()).find((t) => t.id === id);
      if (found) openThread(found);
    },
    [openThread, threads],
  );

  const newThread = useCallback(() => run.clear(), [run]);

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
                activeId={run.threadId}
                runs={active.runs}
                fileCount={files.files.length}
                filesOpen={tab === "files"}
                blocked={tasks.tasks.filter((t) => t.state === "blocked")}
                tasksOpen={tab === "tasks"}
                automationCount={
                  automations.automations.filter((a) => a.enabled).length
                }
                automationsOpen={tab === "automations"}
                guards={guards.guards}
                onGuards={(patch) => void guards.save(patch)}
                onNew={newThread}
                onOpen={openThread}
                onOpenRun={openRun}
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
                onAutomations={() => {
                  setTab("automations");
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
                automations={automations.automations}
                onCreateAutomation={automations.create}
                onSaveAutomation={automations.save}
                onRunAutomation={automations.run}
                onRemoveAutomation={(id) => void automations.remove(id)}
                onOpenThread={(id) => void openThreadById(id)}
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
                turns={run.turns}
                task={run.task}
                trace={run.trace}
                usage={run.usage}
                live={run.live}
                answer={run.answer}
                error={run.error}
                running={run.running}
                watching={run.watching}
                onStart={(task) => void start(task)}
                onStop={run.stop}
                onCut={() => void run.cut()}
              />
            </div>

            {/* Over whatever tab is open: the corrida asking is often one you
              have nothing on screen for, and it is holding the call until you
              answer. */}
            <ApprovalBar
              approvals={approvals.approvals}
              onAnswer={(id, ok) => void approvals.answer(id, ok)}
            />

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
