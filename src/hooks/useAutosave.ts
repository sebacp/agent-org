import { useEffect } from "react";
import { saveOrgFile } from "@/lib/library";
import { toOrgFile } from "@/lib/storage";
import type {
  AgentNode,
  CompanyProfile,
  DepartmentDef,
  OrgEdge,
} from "@/lib/types";

export function useAutosave(
  orgId: string,
  company: CompanyProfile,
  departments: DepartmentDef[],
  nodes: AgentNode[],
  edges: OrgEdge[],
): void {
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        saveOrgFile(orgId, toOrgFile(company, departments, nodes, edges)),
      500,
    );
    return () => window.clearTimeout(timer);
  }, [orgId, company, departments, nodes, edges]);
}
