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

export interface RunRequest {
  /** Which company's file library the agents get to read and write. */
  orgId: string;
  threadId: string;
  task: string;
  company: CompanyProfile;
  departments: DepartmentDef[];
  agents: RunAgent[];
  /** Agent id to the ids of its direct reports, from `delegates` edges only. */
  reports: Record<string, string[]>;
  rootId: string;
}

export type RunEvent =
  | { type: "status"; agentId: string; status: AgentStatus }
  | { type: "delegate"; agentId: string; toId: string; task: string }
  | { type: "tool"; agentId: string; summary: string; fileId?: string }
  | { type: "result"; agentId: string; text: string }
  | { type: "usage"; agentId: string; usage: TokenUsage; cost: number }
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
