import type { ModelId } from "@/lib/models";
import type { SourceGrant } from "@/lib/source-types";
import type {
  CompanyProfile,
  DepartmentDef,
  LibraryPermission,
} from "@/lib/types";
import type { RunUsage, TokenUsage } from "@/lib/usage";

export type AgentStatus =
  | "idle"
  | "planning"
  | "working"
  | "waiting"
  | "done"
  | "error";

export interface RunAgent {
  id: string;
  role: string;
  name: string;
  department: string;
  instructions: string;
  model: ModelId;
  sources: SourceGrant[];
  library: LibraryPermission[];
}

/**
 * The company with nothing asked of it yet. The org chart is only ever edited
 * in the browser, so the browser mirrors this to the server, and that copy is
 * what an automation runs against when there is no tab open.
 */
export interface OrgSnapshot {
  company: CompanyProfile;
  departments: DepartmentDef[];
  agents: RunAgent[];
  /** Agent id to the ids of its direct reports, from `delegates` edges only. */
  reports: Record<string, string[]>;
  rootId: string;
}

/**
 * Where a corrida came from. Every one of them leaves the same kind of thread
 * behind, so without this the riel cannot tell an automation from something you
 * typed yourself.
 */
export interface RunOrigin {
  kind: "manual" | "automation" | "task";
  /** The automation's name or the pendiente's title; empty when you asked. */
  label: string;
}

export const MANUAL_ORIGIN: RunOrigin = { kind: "manual", label: "" };

export interface RunRequest extends OrgSnapshot {
  /** Which company's file library the agents get to read and write. */
  orgId: string;
  threadId: string;
  task: string;
  origin: RunOrigin;
}

/** A corrida happening right now, on this server, for anyone who asks. */
export interface ActiveRun {
  threadId: string;
  title: string;
  /** The whole pedido, for a tab that opens the corrida to show it on top. */
  task: string;
  /** Whose result is the final answer rather than one more line of trace. */
  rootId: string;
  origin: RunOrigin;
  startedAt: string;
}

export type RunEvent =
  | { type: "status"; agentId: string; status: AgentStatus }
  | { type: "delegate"; agentId: string; toId: string; task: string }
  | { type: "tool"; agentId: string; summary: string; fileId?: string }
  | { type: "result"; agentId: string; text: string }
  | { type: "usage"; agentId: string; usage: TokenUsage; cost: number }
  /**
   * A slice of what the agent is writing right now, to be appended to whatever
   * came before. Only the root emits these: a delegate's work is read as a step
   * once it is finished, not letter by letter.
   */
  | { type: "stream"; agentId: string; phase: "thinking" | "answer"; text: string }
  /** One agent gave up; the run keeps going without it. */
  | { type: "failed"; agentId: string; message: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string; agentId?: string };

/** One line of the trace: who did what, live or replayed from a saved thread. */
export interface ThreadStep {
  agentId: string;
  role: string;
  kind: "delegate" | "tool" | "result" | "failed";
  text: string;
}

export interface Thread {
  id: string;
  title: string;
  task: string;
  answer: string;
  /** Absent on threads saved before corridas recorded where they came from. */
  origin?: RunOrigin;
  steps: ThreadStep[];
  /** Absent on threads saved before the run started counting tokens. */
  usage?: RunUsage;
  createdAt: string;
}

export const RUN_LIMITS = {
  maxAgents: 24,
  maxDepth: 4,
  maxTaskChars: 4000,
  maxInstructionChars: 8000,
} as const;
