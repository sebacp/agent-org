import { useCallback, useRef, useState } from "react";
import { buildRunRequest } from "@/lib/run-request";
import {
  MANUAL_ORIGIN,
  type ActiveRun,
  type AgentStatus,
  type RunEvent,
  type RunOrigin,
  type ThreadStep,
} from "@/lib/run-types";
import type {
  AgentNode,
  CompanyProfile,
  DepartmentDef,
  OrgEdge,
} from "@/lib/types";
import { addUsage, NO_USAGE, type RunUsage } from "@/lib/usage";

interface Setters {
  statuses: (fn: (s: Record<string, AgentStatus>) => Record<string, AgentStatus>) => void;
  results: (fn: (r: Record<string, string>) => Record<string, string>) => void;
  trace: (fn: (t: ThreadStep[]) => ThreadStep[]) => void;
  spend: (fn: (s: Record<string, RunUsage>) => Record<string, RunUsage>) => void;
  total: (fn: (u: RunUsage) => RunUsage) => void;
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
    case "usage": {
      const spent: RunUsage = { ...event.usage, cost: event.cost };
      set.spend((s) => ({
        ...s,
        [event.agentId]: addUsage(s[event.agentId] ?? NO_USAGE, spent),
      }));
      set.total((u) => addUsage(u, spent));
      break;
    }
    case "failed":
      set.statuses((s) => ({ ...s, [event.agentId]: "error" }));
      set.trace((t) => [
        ...t,
        {
          agentId: event.agentId,
          role: role(event.agentId),
          kind: "failed",
          text: event.message,
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
  /** The corrida belongs to the server, so this tab reads it and nothing more. */
  const [watching, setWatching] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [trace, setTrace] = useState<ThreadStep[]>([]);
  const [spend, setSpend] = useState<Record<string, RunUsage>>({});
  const [usage, setUsage] = useState<RunUsage>(NO_USAGE);
  const [task, setTask] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const watchRef = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Closing the stream only stops this tab from reading: the corrida is the
    // server's and keeps going.
    watchRef.current?.close();
    watchRef.current = null;
    setWatching(false);
    setRunning(false);
  }, []);

  const clear = useCallback(() => {
    stop();
    setStatuses({});
    setResults({});
    setTrace([]);
    setSpend({});
    setUsage(NO_USAGE);
    setTask(null);
    setAnswer(null);
    setError(null);
  }, [stop]);

  const start = useCallback(
    async (prompt: string, fromId?: string, origin: RunOrigin = MANUAL_ORIGIN) => {
      const request = buildRunRequest(
        { orgId, threadId: crypto.randomUUID(), origin },
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

      stop();
      const controller = new AbortController();
      abortRef.current = controller;

      setRunning(true);
      setStatuses({});
      setResults({});
      setTrace([]);
      setSpend({});
      setUsage(NO_USAGE);
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
              spend: setSpend,
              total: setUsage,
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
    [company, departments, edges, nodes, orgId, stop],
  );

  /**
   * Reads a corrida this tab never started: an automation, or the same company
   * open somewhere else. The server replays what already happened before it
   * streams the rest, so opening one halfway through is not joining it late.
   */
  const watch = useCallback(
    (run: ActiveRun) => {
      stop();
      setStatuses({});
      setResults({});
      setTrace([]);
      setSpend({});
      setUsage(NO_USAGE);
      setTask(run.task);
      setAnswer(null);
      setError(null);
      setRunning(true);
      setWatching(true);

      // The chart the browser has, which is the one the corrida ran against
      // unless somebody edited it in between.
      const roleOf = new Map(nodes.map((n) => [n.id, n.data.role]));
      const source = new EventSource(
        `/api/watch?orgId=${encodeURIComponent(orgId)}&threadId=${encodeURIComponent(
          run.threadId,
        )}`,
      );
      watchRef.current = source;

      const close = () => {
        source.close();
        if (watchRef.current === source) watchRef.current = null;
        setWatching(false);
        setRunning(false);
      };

      source.onmessage = (event: MessageEvent<string>) => {
        applyEvent(JSON.parse(event.data) as RunEvent, roleOf, run.rootId, {
          statuses: setStatuses,
          results: setResults,
          trace: setTrace,
          spend: setSpend,
          total: setUsage,
          answer: setAnswer,
          error: setError,
        });
      };
      source.addEventListener("fin", close);
      source.onerror = close;
    },
    [nodes, orgId, stop],
  );

  const show = useCallback(
    (thread: {
      task: string;
      answer: string;
      steps: ThreadStep[];
      usage?: RunUsage;
    }) => {
      stop();
      setStatuses({});
      setResults({});
      setTrace(thread.steps);
      // A replayed thread only kept its total; the per-agent split is gone.
      setSpend({});
      setUsage(thread.usage ?? NO_USAGE);
      setTask(thread.task);
      setAnswer(thread.answer);
      setError(null);
    },
    [stop],
  );

  return {
    running,
    watching,
    statuses,
    results,
    trace,
    spend,
    usage,
    task,
    answer,
    error,
    start,
    stop,
    clear,
    show,
    watch,
  };
}
