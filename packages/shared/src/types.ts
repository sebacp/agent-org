import type { Edge, Node } from "@xyflow/react";
import type { ModelId } from "./models";
import type { SourceGrant } from "./source-types";

export type Department = string;

/**
 * `mission` is inherited by every agent in the department: at execution time it
 * is prepended to each member's own instructions.
 */
export interface DepartmentDef {
  id: Department;
  label: string;
  mission: string;
}

/**
 * The outermost layer of context: at execution time it is prepended to every
 * agent, above its department mission and its own instructions.
 */
export interface CompanyProfile {
  name: string;
  purpose: string;
}

/**
 * What an agent may do to the shared library beyond reading it, which everyone
 * can always do: the library only works if what one agent files another finds.
 */
export type LibraryPermission = "write" | "delete";

export interface AgentData extends Record<string, unknown> {
  role: string;
  name: string;
  department: Department;
  instructions: string;
  model: ModelId;
  /** The MCP sources this agent may reach, function by function. */
  sources: SourceGrant[];
  library: LibraryPermission[];
}

export type AgentNode = Node<AgentData, "agent">;

/**
 * `delegates` grants task authority: in the execution phase each outgoing
 * delegates edge becomes a tool on the manager. `link` is context only.
 */
export type EdgeKind = "delegates" | "link";

export interface OrgEdgeData extends Record<string, unknown> {
  kind: EdgeKind;
  label?: string;
}

export type OrgEdge = Edge<OrgEdgeData, "org">;

export interface OrgChartFile {
  schemaVersion: 6;
  company: CompanyProfile;
  departments: DepartmentDef[];
  nodes: AgentNode[];
  edges: OrgEdge[];
  savedAt: string;
}

export const SCHEMA_VERSION = 6 as const;

/** Older files stay readable; `migrateOrgFile` remaps what changed. */
export const READABLE_VERSIONS: number[] = [3, 4, 5, 6];
