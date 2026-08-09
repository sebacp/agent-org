import {
  RUN_LIMITS,
  type RunAgent,
  type RunEvent,
  type RunRequest,
} from "@/lib/run-types";
import { chat } from "@/server/deepseek";
import {
  consolidatePrompt,
  leafPrompt,
  splitPrompt,
  systemPrompt,
} from "@/server/prompts";
import { TOOLS, runTool } from "@/server/tools";

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

export async function runOrg(
  request: RunRequest,
  emit: (event: RunEvent) => void,
  signal: AbortSignal,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY ?? "";
  if (!apiKey) throw new Error("Falta DEEPSEEK_API_KEY en el servidor.");

  const byId = new Map(request.agents.map((a) => [a.id, a]));
  const departmentById = new Map(request.departments.map((d) => [d.id, d]));

  async function execute(
    agentId: string,
    task: string,
    depth: number,
    ancestors: Set<string>,
  ): Promise<string> {
    const agent = byId.get(agentId);
    if (!agent) return "";

    const system = systemPrompt(
      agent,
      request.company,
      departmentById.get(agent.department),
    );
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
      );
      emit({
        type: "tool",
        agentId,
        summary: outcome.summary,
        ...(outcome.fileId ? { fileId: outcome.fileId } : {}),
      });
      return outcome.content;
    };

    try {
      if (reports.length === 0 || depth >= RUN_LIMITS.maxDepth) {
        emit({ type: "status", agentId, status: "working" });
        const text = await chat({
          apiKey,
          model: agent.model,
          system,
          user: leafPrompt(task),
          tools: TOOLS,
          onTool,
          signal,
        });
        emit({ type: "result", agentId, text });
        emit({ type: "status", agentId, status: "done" });
        return text;
      }

      emit({ type: "status", agentId, status: "planning" });
      // The split has to come back as clean JSON, so no tools are offered here.
      const plan = await chat({
        apiKey,
        model: agent.model,
        system,
        user: splitPrompt(task, reports),
        signal,
      });
      const assignments = parseAssignments(plan, reports);

      emit({ type: "status", agentId, status: "waiting" });
      const nextAncestors = new Set(ancestors).add(agentId);
      const answers = await Promise.all(
        assignments.map(async (assignment) => {
          emit({
            type: "delegate",
            agentId,
            toId: assignment.id,
            task: assignment.encargo || task,
          });
          return {
            agent: byId.get(assignment.id)!,
            text: await execute(
              assignment.id,
              assignment.encargo || task,
              depth + 1,
              nextAncestors,
            ),
          };
        }),
      );

      emit({ type: "status", agentId, status: "working" });
      const text = await chat({
        apiKey,
        model: agent.model,
        system,
        user: consolidatePrompt(
          task,
          answers.filter((a) => a.agent && a.text),
        ),
        tools: TOOLS,
        onTool,
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
