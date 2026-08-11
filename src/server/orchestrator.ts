import {
  RUN_LIMITS,
  type RunAgent,
  type RunEvent,
  type RunRequest,
} from "@/lib/run-types";
import { modelCost, type TokenUsage } from "@/lib/usage";
import { chat } from "@/server/deepseek";
import {
  consolidatePrompt,
  directoryPrompt,
  leafPrompt,
  splitPrompt,
  systemPrompt,
  type AgentAccess,
} from "@/server/prompts";
import { sandboxReady } from "@/server/sandbox";
import { accessByAgent } from "@/server/sources";
import { runTool, toolsFor, type ToolSchema } from "@/server/tools";

interface Assignment {
  id: string;
  encargo: string;
}

/**
 * Models wrap JSON in prose or fences often enough that a strict parse would
 * abort otherwise fine runs, so an unreadable split falls back to handing the
 * whole task to every report.
 */
function parseAssignments(raw: string, reports: RunAgent[]): Assignment[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  const known = new Map(reports.map((r) => [r.id, r]));

  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(parsed)) {
        const picked = new Map<string, Assignment>();
        for (const item of parsed) {
          const entry = item as Partial<Assignment>;
          if (
            typeof entry?.id !== "string" ||
            typeof entry.encargo !== "string" ||
            !known.has(entry.id) ||
            // A repeated id would run the same agent twice and bill it twice.
            picked.has(entry.id)
          ) {
            continue;
          }
          picked.set(entry.id, {
            id: entry.id,
            encargo: entry.encargo.slice(0, RUN_LIMITS.maxTaskChars),
          });
        }
        if (picked.size > 0) return [...picked.values()];
      }
    } catch {
      // Falls through to the broadcast below.
    }
  }

  // An empty `encargo` makes the caller reuse the original task verbatim.
  return reports.map((r) => ({ id: r.id, encargo: "" }));
}

function reason(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "se cortó sin explicación";
}

export async function runOrg(
  request: RunRequest,
  emit: (event: RunEvent) => void,
  signal: AbortSignal,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY ?? "";
  if (!apiKey) throw new Error("Falta DEEPSEEK_API_KEY en el servidor.");

  const byId = new Map(request.agents.map((a) => [a.id, a]));
  const departmentById = new Map(request.departments.map((d) => [d.id, d]));

  const granted = await accessByAgent(request.orgId, request.agents);
  // The prompts get the labels and nothing else: a source carries its token.
  const access = new Map<string, AgentAccess[]>(
    [...granted].map(([id, sources]) => [
      id,
      sources.map((s) => ({ label: s.label || "fuente", tools: s.allowed })),
    ]),
  );
  const directory = directoryPrompt(request, access);
  // Asked once for the whole corrida: it is a property of the machine, and it
  // decides both whether the tool is offered and whether the prompt names it.
  const penned = await sandboxReady();

  async function execute(
    agentId: string,
    task: string,
    depth: number,
    ancestors: Set<string>,
  ): Promise<string> {
    const agent = byId.get(agentId);
    if (!agent) return "";

    const sources = granted.get(agentId) ?? [];
    const system = systemPrompt(
      agent,
      request.company,
      departmentById.get(agent.department),
      directory,
      sources.map((s) => s.label || "fuente"),
      penned,
    );
    // Reaching a source means connecting to it, so the list is only built if a
    // branch actually offers tools.
    let pending: Promise<ToolSchema[]> | null = null;
    const tools = () =>
      (pending ??= toolsFor(request.orgId, sources, agent.library));
    // Ancestors are excluded so a manually drawn cycle can't recurse forever.
    const reports = (request.reports[agentId] ?? [])
      .filter((id) => !ancestors.has(id) && byId.has(id))
      .map((id) => byId.get(id)!);

    const onTool = async (toolCall: {
      function: { name: string; arguments: string };
    }): Promise<string> => {
      const outcome = await runTool(
        request.orgId,
        toolCall.function.name,
        toolCall.function.arguments,
        agent,
        sources,
        agent.library,
        task,
        { threadId: request.threadId, signal },
      );
      emit({
        type: "tool",
        agentId,
        summary: outcome.summary,
        ...(outcome.detail ? { detail: outcome.detail } : {}),
        ...(outcome.fileId ? { fileId: outcome.fileId } : {}),
        ...(outcome.source ? { source: outcome.source } : {}),
      });
      return outcome.content;
    };

    const onUsage = (usage: TokenUsage) => {
      emit({ type: "usage", agentId, usage, cost: modelCost(agent.model, usage) });
    };

    // Only the root writes to the conversation, so it is the only one worth
    // watching live; the rest land as steps when they finish.
    const live = agentId === request.rootId;
    // What was already asked and answered in this hilo, and only for the one
    // who was asked it: a delegate gets an encargo written to stand on its own.
    const history = live ? request.history : undefined;
    const onThinking = live
      ? (text: string) => emit({ type: "stream", agentId, phase: "thinking", text })
      : undefined;
    const onText = live
      ? (text: string) => emit({ type: "stream", agentId, phase: "answer", text })
      : undefined;

    try {
      if (reports.length === 0 || depth >= RUN_LIMITS.maxDepth) {
        emit({ type: "status", agentId, status: "working" });
        const text = await chat({
          apiKey,
          model: agent.model,
          system,
          user: leafPrompt(task),
          history,
          tools: await tools(),
          onTool,
          onUsage,
          onThinking,
          onText,
          signal,
        });
        emit({ type: "result", agentId, text });
        emit({ type: "status", agentId, status: "done" });
        return text;
      }

      emit({ type: "status", agentId, status: "planning" });
      // The split has to come back as clean JSON, so no tools are offered here
      // and the text stays off screen: how it is deciding reads, the JSON does
      // not.
      const plan = await chat({
        apiKey,
        model: agent.model,
        system,
        user: splitPrompt(task, reports, request, access),
        history,
        onUsage,
        onThinking,
        signal,
      });
      const assignments = parseAssignments(plan, reports);

      emit({ type: "status", agentId, status: "waiting" });
      const nextAncestors = new Set(ancestors).add(agentId);
      let firstFailure: unknown = null;
      const answers = await Promise.all(
        assignments.map(async (assignment) => {
          emit({
            type: "delegate",
            agentId,
            toId: assignment.id,
            task: assignment.encargo || task,
          });
          const child = byId.get(assignment.id)!;
          try {
            return {
              agent: child,
              text: await execute(
                assignment.id,
                assignment.encargo || task,
                depth + 1,
                nextAncestors,
              ),
            };
          } catch (error) {
            // Stopping the run is a decision, not something to route around.
            if (signal.aborted) throw error;
            firstFailure ??= error;
            emit({
              type: "failed",
              agentId: assignment.id,
              message: reason(error),
            });
            return { agent: child, text: "" };
          }
        }),
      );

      const usable = answers.filter((a) => a.agent && a.text);
      // Nobody delivered, so there is nothing to consolidate and no point in
      // paying for a summary of silence.
      if (usable.length === 0 && firstFailure) throw firstFailure;

      emit({ type: "status", agentId, status: "working" });
      const text = await chat({
        apiKey,
        model: agent.model,
        system,
        user: consolidatePrompt(
          task,
          usable,
          answers.filter((a) => !a.text).map((a) => a.agent.role),
        ),
        history,
        tools: await tools(),
        onTool,
        onUsage,
        onThinking,
        onText,
        signal,
      });
      emit({ type: "result", agentId, text });
      emit({ type: "status", agentId, status: "done" });
      return text;
    } catch (error) {
      emit({ type: "status", agentId, status: "error" });
      throw error;
    }
  }

  return execute(request.rootId, request.task, 0, new Set());
}
