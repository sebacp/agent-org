import type { OrgSnapshot, RunAgent } from "@/lib/run-types";
import type { CompanyProfile, DepartmentDef } from "@/lib/types";

/** One agent's granted source, named the way a colleague would name it. */
export interface AgentAccess {
  label: string;
  tools: string[];
}

function accessLine(access: AgentAccess[], lead = "usa"): string {
  if (access.length === 0) return "";
  const named = access.map((a) => `${a.label} (${a.tools.join(", ")})`);
  return ` · ${lead} ${named.join("; ")}`;
}

/**
 * Everything a branch can reach, merged. A manager is picked for what its side
 * of the chart can do, not for what it holds itself, and a source two levels
 * down is otherwise invisible at the moment the work gets handed out.
 */
function branchAccess(
  reports: Record<string, string[]>,
  access: Map<string, AgentAccess[]>,
  rootId: string,
): AgentAccess[] {
  const found = new Map<string, Set<string>>();
  const seen = new Set<string>();

  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const source of access.get(id) ?? []) {
      const tools = found.get(source.label) ?? new Set<string>();
      found.set(source.label, tools);
      for (const tool of source.tools) tools.add(tool);
    }
    for (const child of reports[id] ?? []) walk(child);
  };

  walk(rootId);
  return [...found].map(([label, tools]) => ({ label, tools: [...tools] }));
}

/**
 * The whole company, not just this agent's own branch. The connected sources
 * are handed out one agent at a time, so without this an agent that lacks an
 * access has no way to tell it exists and asks you for credentials the company
 * already has.
 *
 * Identical for every agent on purpose: it sits before anything personal so the
 * model can charge the whole block to its cache once per corrida.
 */
export function directoryPrompt(
  org: Pick<OrgSnapshot, "agents" | "departments" | "reports" | "rootId">,
  access: Map<string, AgentAccess[]>,
): string {
  const byId = new Map(org.agents.map((a) => [a.id, a]));
  const areaOf = new Map(org.departments.map((d) => [d.id, d.label]));
  const lines: string[] = [];
  const seen = new Set<string>();

  const walk = (id: string, depth: number) => {
    const agent = byId.get(id);
    if (!agent || seen.has(id)) return;
    seen.add(id);
    const area = areaOf.get(agent.department);
    lines.push(
      `${"  ".repeat(depth)}- ${agent.role.trim() || "sin rol"}${
        agent.name.trim() ? ` (${agent.name.trim()})` : ""
      }${area ? ` · ${area}` : ""}${accessLine(access.get(id) ?? [])}`,
    );
    for (const childId of org.reports[id] ?? []) walk(childId, depth + 1);
  };

  walk(org.rootId, 0);
  // Anyone the chart left hanging still works here.
  for (const agent of org.agents) walk(agent.id, 0);

  return `Así está armada la empresa, con lo que tiene conectado cada uno. Buscate por tu rol; arriba tuyo está a quién le reportás.

${lines.join("\n")}

Las herramientas conectadas están repartidas: vos sólo podés llamar a las tuyas. Si lo que te falta lo tiene otro rol, nombralo en vez de pedir credenciales.`;
}

/**
 * The three inheritance layers the wizard promises, in the order the UI shows
 * them: company purpose, then area mission, then the agent's own instructions.
 */
export function systemPrompt(
  agent: RunAgent,
  company: CompanyProfile,
  department: DepartmentDef | undefined,
  /** The company chart, same text for everyone. */
  directory: string,
  /** Labels of the data sources this agent was granted. */
  sources: string[] = [],
): string {
  const blocks = [
    `Trabajás en ${company.name.trim() || "la compañía"}.`,
    company.purpose.trim(),
    directory,
    department &&
      `Tu área es ${department.label}.\n${department.mission.trim()}`,
    `Tu rol es ${agent.role.trim() || "sin rol"}${
      agent.name.trim() ? ` (${agent.name.trim()})` : ""
    }.\n${agent.instructions.trim()}`,
    `La empresa tiene una biblioteca de archivos compartida. Antes de responder algo que ya podría estar escrito, buscá ahí con buscar_archivos o listar_archivos, y leé lo que sirva con leer_archivo.`,
    agent.library.includes("write")
      ? `Si producís algo que valga la pena conservar (un plan, un análisis, un texto terminado), guardalo con guardar_archivo y mencioná en tu respuesta que lo guardaste. Para una respuesta corta no hace falta guardar nada. Si una herramienta te devuelve un link a un archivo (una imagen, un CSV, un PDF), bajalo con guardar_desde_link en vez de pasar la URL: esos links se vencen.`
      : `No podés escribir en la biblioteca: devolvé el trabajo terminado en tu respuesta para que lo guarde quien corresponda.`,
    agent.library.includes("delete") &&
      `Podés borrar archivos con borrar_archivo, y eso no se deshace. Usalo sólo para lo que quedó mal o duplicado; ante la duda dejalo y decilo.`,
    sources.length > 0 &&
      `Tenés acceso a estas fuentes de datos: ${sources.join(", ")}. Sus herramientas empiezan con "fuente__", y sólo ves las funciones que te habilitaron: si necesitás una que no está, no la inventes, dejá un pendiente. Si lo que necesitás son datos reales, traelos de ahí en lugar de estimar; si la fuente no responde, decilo y seguí.`,
    // Blocked agents used to write requirement documents that nobody could act
    // on, which is the failure this board exists to absorb.
    `Si te falta algo que no está en la biblioteca (un dato, un acceso, una decisión que no te toca), no escribas un documento pidiéndolo ni inventes el dato: dejalo anotado con crear_pendiente y seguí con la parte que sí podés resolver. Si el acceso lo tiene otro rol de la empresa, decilo así ("esto lo puede hacer X, que tiene Y conectado") en lugar de pedir credenciales. Mirá listar_pendientes antes de arrancar, porque lo que te falta puede estar ya contestado ahí; si resolviste uno, cerralo con cerrar_pendiente.`,
    "Escribís en español rioplatense. Sos concreto y no rellenás.\nPodés usar markdown liviano: títulos con ##, listas con guiones, **negrita** para lo importante y tablas cuando compares cosas. No abras bloques de código salvo que el contenido sea código.",
  ];
  return blocks.filter(Boolean).join("\n\n");
}

export function leafPrompt(task: string): string {
  return `Tu manager te encargó esto:

<encargo>
${task}
</encargo>

Resolvelo vos, con tu criterio y tu especialidad. No delegues ni pidas permiso.`;
}

export function splitPrompt(
  task: string,
  reports: RunAgent[],
  org: Pick<OrgSnapshot, "reports">,
  access: Map<string, AgentAccess[]>,
): string {
  const roster = reports
    .map((r) => {
      const own = access.get(r.id) ?? [];
      const ownTools = new Map(own.map((a) => [a.label, new Set(a.tools)]));
      const below = branchAccess(org.reports, access, r.id).flatMap((a) => {
        const tools = a.tools.filter((t) => !ownTools.get(a.label)?.has(t));
        return tools.length > 0 ? [{ label: a.label, tools }] : [];
      });
      return `- ${r.id} · ${r.role}${r.name ? ` (${r.name})` : ""}${accessLine(
        own,
      )}${accessLine(below, "su equipo usa")}`;
    })
    .join("\n");

  return `Tu manager te encargó esto:

<encargo>
${task}
</encargo>

Tenés este equipo a cargo:
${roster}

Repartí el encargo entre ellos. Devolvé SOLO un array JSON, sin texto alrededor
y sin bloque de código:

[{"id": "<id exacto de la lista>", "encargo": "<qué le pedís>"}]

Reglas:
- Incluí únicamente a quienes aportan de verdad. Si a alguien no le toca, dejalo afuera.
- Lo que necesite una herramienta conectada va para quien la tiene, aunque el tema parezca de otro. Nadie más la puede llamar.
- Cada encargo se tiene que entender solo: nada de "lo anterior" ni referencias al resto del equipo.
- Máximo tres oraciones por encargo.`;
}

export function consolidatePrompt(
  task: string,
  answers: { agent: RunAgent; text: string }[],
  /** Roles whose work fell over, so the answer can admit the hole. */
  missing: string[] = [],
): string {
  const body = answers
    .map((a) => `## ${a.agent.role}${a.agent.name ? ` — ${a.agent.name}` : ""}
${a.text}`)
    .join("\n\n");

  return `Tu manager te encargó esto:

<encargo>
${task}
</encargo>

Tu equipo respondió:

${body}
${
  missing.length
    ? `\nNo llegaron a contestar: ${missing.join(", ")}. Armá la respuesta con lo que tenés y aclará en una línea al final qué quedó sin cubrir.\n`
    : ""
}
Escribí la respuesta final. Una sola postura, no un resumen de quién dijo qué.
Si hay contradicciones, resolvelas y decí con qué te quedás y por qué.`;
}
