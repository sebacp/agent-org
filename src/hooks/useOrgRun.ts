import { useCallback, useRef, useState } from "react";
import { buildRunRequest } from "@/lib/run-request";
import type {
  AgentStatus,
  RunEvent,
  ThreadStep,
} from "@/lib/run-types";
import type {
  AgentNode,
  CompanyProfile,
  DepartmentDef,
  OrgEdge,
} from "@/lib/types";

interface Setters {
  statuses: (fn: (s: Record<string, AgentStatus>) => Record<string, AgentStatus>) => void;
  results: (fn: (r: Record<string, string>) => Record<string, string>) => void;
  trace: (fn: (t: ThreadStep[]) => ThreadStep[]) => void;
  answer: (text: string) => void;
  error: (message: string) => void;
}

function applyEvent(
  event: RunEvent,
  roleOf: Map<string, string>,
  rootId: string,
  set: Setters,
): void {
  const role = (id: string) => roleOf.get(id) ?? id;

  switch (event.type) {
    case "status":
      set.statuses((s) => ({ ...s, [event.agentId]: event.status }));
      break;
    case "delegate":
      set.trace((t) => [
        ...t,
        {
          agentId: event.agentId,
          role: role(event.agentId),
          kind: "delegate",
          text: `${role(event.toId)}: ${event.task}`,
        },
      ]);
      break;
    case "tool":
      set.trace((t) => [
        ...t,
        {
          agentId: event.agentId,
          role: role(event.agentId),
          kind: "tool",
          text: event.summary,
        },
      ]);
      break;
    case "result":
      set.results((r) => ({ ...r, [event.agentId]: event.text }));
      // The root's result *is* the final answer, shown on its own below.
      if (event.agentId !== rootId) {
        set.trace((t) => [
          ...t,
          {
            agentId: event.agentId,
            role: role(event.agentId),
            kind: "result",
            text: event.text,
          },
        ]);
      }
      break;
    case "done":
      set.answer(event.text);
      break;
    case "error":
      set.error(event.message);
      break;
  }
}

export function useOrgRun(
  orgId: string,
  company: CompanyProfile,
  departments: DepartmentDef[],
  nodes: AgentNode[],
  edges: OrgEdge[],
) {
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [trace, setTrace] = useState<ThreadStep[]>([]);
  const [task, setTask] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }, []);

  const clear = useCallback(() => {
    stop();
    setStatuses({});
    setResults({});
    setTrace([]);
    setTask(null);
    setAnswer(null);
    setError(null);
  }, [stop]);

  const start = useCallback(
    async (prompt: string, fromId?: string) => {
      const request = buildRunRequest(
        { orgId, threadId: crypto.randomUUID() },
        prompt,
        company,
        departments,
        nodes,
        edges,
        fromId,
      );
      if (!request) {
        setError("El organigrama no tiene agentes.");
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setRunning(true);
      setStatuses({});
      setResults({});
      setTrace([]);
      setTask(prompt);
      setAnswer(null);
      setError(null);

      const roleOf = new Map(request.agents.map((a) => [a.id, a.role]));

      try {
        const response = await fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `El servidor respondió ${response.status}.`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line; keep the partial tail.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const payload = frame.replace(/^data: /, "").trim();
            if (!payload) continue;
            applyEvent(JSON.parse(payload) as RunEvent, roleOf, request.rootId, {
              statuses: setStatuses,
              results: setResults,
              trace: setTrace,
              answer: setAnswer,
              error: setError,
            });
          }
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Falló la corrida.");
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setRunning(false);
      }
    },
    [company, departments, edges, nodes, orgId],
  );

  const show = useCallback(
    (thread: { task: string; answer: string; steps: ThreadStep[] }) => {
      stop();
      setStatuses({});
      setResults({});
      setTrace(thread.steps);
      setTask(thread.task);
      setAnswer(thread.answer);
      setError(null);
    },
    [stop],
  );

  return {
    running,
    statuses,
    results,
    trace,
    task,
    answer,
    error,
    start,
    stop,
    clear,
    show,
  };
}
