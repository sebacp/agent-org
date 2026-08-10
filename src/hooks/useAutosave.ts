import { useEffect } from "react";
import { mirrorOrg } from "@/lib/api";
import { saveOrgFile } from "@/lib/library";
import { buildOrgSnapshot } from "@/lib/run-request";
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
    const timer = window.setTimeout(() => {
      saveOrgFile(orgId, toOrgFile(company, departments, nodes, edges));

      // The copy the automations run against. It only refreshes while a tab is
      // open, so one edited elsewhere stays behind until you come back here —
      // and a failed mirror must not stop the editor from saving.
      const snapshot = buildOrgSnapshot(company, departments, nodes, edges);
      if (snapshot) void mirrorOrg(orgId, snapshot).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [orgId, company, departments, nodes, edges]);
}
