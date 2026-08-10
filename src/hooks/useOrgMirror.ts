import { useEffect, useRef } from "react";
import { mirrorOrg } from "@/lib/api";
import { buildOrgSnapshot } from "@/lib/run-request";
import type {
  AgentNode,
  CompanyProfile,
  DepartmentDef,
  OrgEdge,
} from "@/lib/types";

/**
 * The server keeps its own copy of the chart so an automation can run with no
 * tab open, and it only ever refreshes from one that is. Nothing outside the
 * editor changes the org, so the copy is sent once, on the way in.
 */
export function useOrgMirror(
  orgId: string,
  company: CompanyProfile,
  departments: DepartmentDef[],
  nodes: AgentNode[],
  edges: OrgEdge[],
): void {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (sent.current === orgId) return;
    sent.current = orgId;
    const snapshot = buildOrgSnapshot(company, departments, nodes, edges);
    if (snapshot) void mirrorOrg(orgId, snapshot).catch(() => undefined);
  }, [orgId, company, departments, nodes, edges]);
}
