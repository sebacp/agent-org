import { isOrgChartFile, migrateOrgFile, toOrgFile } from "@/lib/storage";
import type {
  AgentNode,
  CompanyProfile,
  DepartmentDef,
  OrgChartFile,
  OrgEdge,
} from "@/lib/types";

export function downloadOrg(
  company: CompanyProfile,
  departments: DepartmentDef[],
  nodes: AgentNode[],
  edges: OrgEdge[],
): void {
  const blob = new Blob(
    [JSON.stringify(toOrgFile(company, departments, nodes, edges), null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `organigrama-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseOrgFile(text: string): OrgChartFile {
  const parsed: unknown = JSON.parse(text);
  if (!isOrgChartFile(parsed)) {
    throw new Error("El archivo no es un organigrama válido.");
  }
  return migrateOrgFile(parsed);
}
