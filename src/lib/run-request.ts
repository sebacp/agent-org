import { ROOT_DEPARTMENT } from "@/lib/roles";
import type { OrgSnapshot, RunOrigin, RunRequest } from "@/lib/run-types";
import type {
  AgentNode,
  CompanyProfile,
  DepartmentDef,
  OrgEdge,
} from "@/lib/types";

/** The CEO, or whoever ended up with nobody above them. */
export function findRootId(nodes: AgentNode[], edges: OrgEdge[]): string | null {
  const ceo = nodes.find((n) => n.data.department === ROOT_DEPARTMENT);
  if (ceo) return ceo.id;

  const managed = new Set(
    edges.filter((e) => e.data?.kind !== "link").map((e) => e.target),
  );
  return nodes.find((n) => !managed.has(n.id))?.id ?? nodes[0]?.id ?? null;
}

export function buildOrgSnapshot(
  company: CompanyProfile,
  departments: DepartmentDef[],
  nodes: AgentNode[],
  edges: OrgEdge[],
  /** Resuming a pending task starts at whoever got stuck, not at the CEO. */
  fromId?: string,
): OrgSnapshot | null {
  const start = fromId && nodes.some((n) => n.id === fromId) ? fromId : null;
  const rootId = start ?? findRootId(nodes, edges);
  if (!rootId) return null;

  const reports: Record<string, string[]> = {};
  for (const edge of edges) {
    if (edge.data?.kind === "link") continue;
    (reports[edge.source] ??= []).push(edge.target);
  }

  return {
    company,
    departments,
    agents: nodes.map((node) => ({
      id: node.id,
      role: node.data.role,
      name: node.data.name,
      department: node.data.department,
      instructions: node.data.instructions,
      model: node.data.model,
      sources: node.data.sources ?? [],
      library: node.data.library ?? ["write"],
    })),
    reports,
    rootId,
  };
}

export function buildRunRequest(
  ids: { orgId: string; threadId: string; origin: RunOrigin },
  task: string,
  company: CompanyProfile,
  departments: DepartmentDef[],
  nodes: AgentNode[],
  edges: OrgEdge[],
  fromId?: string,
): RunRequest | null {
  const org = buildOrgSnapshot(company, departments, nodes, edges, fromId);
  return org && { ...org, ...ids, task };
}
