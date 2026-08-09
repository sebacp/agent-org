import { autoLayout } from "@/lib/layout";
import { DEPARTMENT_CATALOG, ROLE_PRESETS, ROOT_DEPARTMENT } from "@/lib/roles";
import type {
  AgentNode,
  CompanyProfile,
  DepartmentDef,
  OrgEdge,
} from "@/lib/types";

export interface OrgState {
  company: CompanyProfile;
  departments: DepartmentDef[];
  nodes: AgentNode[];
  edges: OrgEdge[];
}

function preset(role: string) {
  const found = ROLE_PRESETS.find((p) => p.role === role);
  if (!found) throw new Error(`Preset desconocido: ${role}`);
  return found;
}

function agent(id: string, role: string): AgentNode {
  const { name, department, model, instructions } = preset(role);
  return {
    id,
    type: "agent",
    position: { x: 0, y: 0 },
    data: {
      role,
      name,
      department,
      model,
      instructions,
      sources: [],
      library: ["write"],
    },
  };
}

function delegates(source: string, target: string): OrgEdge {
  return {
    id: `e_${source}_${target}`,
    type: "org",
    source,
    target,
    data: { kind: "delegates" },
  };
}

function area(id: string): DepartmentDef {
  const found = DEPARTMENT_CATALOG.find((d) => d.id === id);
  if (!found) throw new Error(`Área desconocida: ${id}`);
  return { ...found };
}

/** Where a new user starts: their own company, one area, one CEO. */
export function seedOrg(): OrgState {
  return {
    company: { name: "", purpose: "" },
    departments: [area(ROOT_DEPARTMENT)],
    nodes: [agent("ceo", "CEO")],
    edges: [],
  };
}

/** Offered in step 1 so the flow can be explored without typing anything. */
export function exampleOrg(): OrgState {
  const nodes = [
    agent("ceo", "CEO"),
    agent("cmo", "CMO"),
    agent("cfo", "CFO"),
    agent("cto", "CTO"),
    agent("coo", "COO"),
    agent("chro", "CHRO"),
    agent("contenido", "Contenido"),
    agent("performance", "Performance"),
    agent("sdr", "SDR"),
    agent("controller", "Controller"),
    agent("ingenieria", "Ingeniería"),
    agent("datos", "Datos"),
    agent("soporte", "Soporte"),
    agent("recruiting", "Recruiting"),
  ];

  const edges = [
    delegates("ceo", "cmo"),
    delegates("ceo", "cfo"),
    delegates("ceo", "cto"),
    delegates("ceo", "coo"),
    delegates("ceo", "chro"),
    delegates("cmo", "contenido"),
    delegates("cmo", "performance"),
    delegates("cmo", "sdr"),
    delegates("cfo", "controller"),
    delegates("cto", "ingenieria"),
    delegates("cto", "datos"),
    delegates("coo", "soporte"),
    delegates("chro", "recruiting"),
  ];

  return {
    company: {
      name: "Nimbo",
      purpose:
        "Vendemos un software de facturación para pymes de Latinoamérica. Cobramos una suscripción mensual y crecemos por búsqueda orgánica y por recomendación de contadores.\n\nHoy somos 40 personas, facturamos 180 mil dólares por mes y el churn mensual está en 4,5%. El objetivo del año es llegar a 300 mil sin levantar otra ronda.",
    },
    departments: DEPARTMENT_CATALOG.map((d) => ({ ...d })),
    nodes: autoLayout(nodes, edges),
    edges,
  };
}
