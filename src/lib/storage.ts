import { coerceModel } from "@/lib/models";
import {
  READABLE_VERSIONS,
  SCHEMA_VERSION,
  type AgentNode,
  type CompanyProfile,
  type DepartmentDef,
  type OrgChartFile,
  type OrgEdge,
} from "@/lib/types";

/**
 * Pure shape helpers. Where an org actually lives — one localStorage slot per
 * company, listed by the library — is `@/lib/library`.
 */

export function toOrgFile(
  company: CompanyProfile,
  departments: DepartmentDef[],
  nodes: AgentNode[],
  edges: OrgEdge[],
): OrgChartFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    company,
    departments,
    nodes,
    edges,
    savedAt: new Date().toISOString(),
  };
}

export function isOrgChartFile(value: unknown): value is OrgChartFile {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<OrgChartFile>;
  return (
    READABLE_VERSIONS.includes(candidate.schemaVersion as number) &&
    typeof candidate.company === "object" &&
    candidate.company !== null &&
    Array.isArray(candidate.departments) &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges)
  );
}

/** v3 stored Claude model ids, which no longer exist in the catalog. */
export function migrateOrgFile(file: OrgChartFile): OrgChartFile {
  return {
    ...file,
    schemaVersion: SCHEMA_VERSION,
    nodes: file.nodes.map((node) => ({
      ...node,
      data: { ...node.data, model: coerceModel(node.data.model) },
    })),
  };
}
