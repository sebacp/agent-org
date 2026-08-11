import { useCallback, useEffect, useState } from "react";
import { mirrorOrg } from "@/lib/api";
import { saveOrgFile } from "@/lib/library";
import { buildOrgSnapshot } from "@/lib/run-request";
import { toOrgFile } from "@/lib/storage";
import type {
  AgentNode,
  CompanyProfile,
  DepartmentDef,
  OrgEdge,
} from "@agent-org/shared/types";

/**
 * What counts as a change to the chart. React Flow writes selection, hover and
 * measurements back into its own nodes, and none of that is anybody's edit.
 */
function fingerprint(
  company: CompanyProfile,
  departments: DepartmentDef[],
  nodes: AgentNode[],
  edges: OrgEdge[],
): string {
  return JSON.stringify({
    company,
    departments,
    nodes: nodes.map((n) => [n.id, n.position.x, n.position.y, n.data]),
    edges: edges.map((e) => [e.id, e.source, e.target, e.data]),
  });
}

export function useOrgSave(
  orgId: string,
  company: CompanyProfile,
  departments: DepartmentDef[],
  nodes: AgentNode[],
  edges: OrgEdge[],
) {
  const current = fingerprint(company, departments, nodes, edges);
  // Whatever was on screen when the editor opened is what is already on disk.
  const [stored, setStored] = useState(current);
  const dirty = current !== stored;

  const save = useCallback(() => {
    saveOrgFile(orgId, toOrgFile(company, departments, nodes, edges));

    // The copy the automations run against. It only refreshes from an open
    // tab, and a failed mirror must not stop the editor from saving.
    const snapshot = buildOrgSnapshot(company, departments, nodes, edges);
    if (snapshot) void mirrorOrg(orgId, snapshot).catch(() => undefined);

    setStored(fingerprint(company, departments, nodes, edges));
  }, [orgId, company, departments, nodes, edges]);

  // Nothing is written until the button is pressed, so closing the tab is now
  // a way to lose an afternoon.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return { dirty, save };
}
