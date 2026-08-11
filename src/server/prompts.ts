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
  /** Whether this machine can run a script safely; if not, it isn't offered. */
  penned = false,
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
      ? `Si producís algo que valga la pena conservar (un plan, un análisis, un texto terminado), guardalo con guardar_archivo y mencioná en tu respuesta que lo guardaste. Para una respuesta corta no hace falta guardar nada. Lo que una fuente devuelve como archivo (una imagen, un CSV, un PDF) se guarda solo apenas llega, así que nombralo por su título y no por su link. Un link que venga de otro lado bajalo con guardar_desde_link.`
      : `No podés escribir en la biblioteca: devolvé el trabajo terminado en tu respuesta para que lo guarde quien corresponda.`,
    agent.library.includes("delete") &&
      `Podés borrar archivos con borrar_archivo, y eso no se deshace. Usalo sólo para lo que quedó mal o duplicado; ante la duda dejalo y decilo.`,
    sources.length > 0 &&
      `Tenés acceso a estas fuentes de datos: ${sources.join(", ")}. Sus herramientas empiezan con "fuente__", y sólo ves las funciones que te habilitaron: si necesitás una que no está, no la inventes, dejá un pendiente. Si lo que necesitás son datos reales, traelos de ahí en lugar de estimar; si la fuente no responde, decilo y seguí.`,
    // A listing that gets cut in the middle looks exactly like a listing that
    // ended, and a model will report totals off half the year without noticing.
    sources.length > 0 &&
      agent.library.includes("write") &&
      `Un listado grande (cobros, suscripciones, filas de una tabla) no entra en tu contexto, y si lo pedís directo te llega cortado. Para eso está volcar_de_fuente: llama a la misma función, recorre la paginación entera y guarda todo en un archivo de datos sin pasártelo. Lo llamás una sola vez por listado — no le pidas la página siguiente, eso ya lo hace él. Después preguntale lo que necesites con consultar_archivo, que filtra, agrupa y calcula sobre todos los registros. Nunca saques un total de una respuesta que vino cortada. Si un volcado vuelve marcado como incompleto, lo que salga de ahí es un piso y no un total: volvé a llamar a volcar_de_fuente con el mismo archivo para que siga desde donde quedó, o acotá el pedido (un rango de fechas más corto) hasta que entre entero. Si igual lo tenés que informar, decí que falta.`,
    // Asking Stripe for status=active only is how an MRR lost every past_due
    // subscription in it: nothing downstream said a filter had been applied, so
    // there was nothing to notice.
    sources.length > 0 &&
      agent.library.includes("write") &&
      `Y no acotes en la fuente lo que después vas a totalizar. Si filtrás al pedir — un solo estado, un solo plan, un solo país —, lo que quedó afuera no aparece en ningún lado y el total sale corto sin que nada lo indique. Traé el listado entero y filtrá al analizarlo, que ahí el criterio queda escrito y se puede cambiar sin volver a la fuente.`,
    // A whole corrida once spent thirty consultas building an MRR out of métricas
    // it could ask for, and got a number that was off by a sixth — not because
    // the sums were wrong, but because the rule it counted by was never written
    // anywhere anybody could argue with.
    penned &&
      `Cuando lo que te falta es una cuenta y no un dato, escribila en Python con calcular en vez de armarla a fuerza de consultas. consultar_archivo te da una métrica sobre un campo tal como está; todo lo demás — un valor derivado de cada registro, una suma con condiciones, plata llevada a otra unidad de tiempo, dos archivos cruzados — sale de un script, en una sola llamada y sin que vos hagas la aritmética. Y ese script queda escrito en el hilo: el criterio con el que contaste se puede leer y discutir, la cuenta que hacés de cabeza no. No sumes ni promedies vos lo que puede hacer la máquina.`,
    // Three corridas asked for the same MRR and answered 5.116, 4.858 and
    // 485.866, and all three closed with "margen de error mínimo". The sums were
    // right every time; what changed was who got counted, and that was never
    // said out loud, so there was nothing to disagree with.
    `Un número que depende de un criterio no es un dato, es una decisión. Cuando lo que te piden admite más de una definición razonable — qué cuenta como cliente activo, si entran los que ya avisaron que se van, qué período, qué moneda —, decí con cuál lo contaste y dá también el número con la otra. Dos cifras y la regla que las separa valen más que una sola con un decimal de más. Y no pongas un margen de error que no mediste: si no lo calculaste, el margen honesto es cuánto se mueve el número al cambiar el criterio, y eso sí lo podés calcular.`,
    // Blocked agents used to write requirement documents that nobody could act
    // on, which is the failure this board exists to absorb.
    `Si te falta algo que no está en la biblioteca (un dato, un acceso, una decisión que no te toca), no escribas un documento pidiéndolo ni inventes el dato: dejalo anotado con crear_pendiente y seguí con la parte que sí podés resolver. Si el acceso lo tiene otro rol de la empresa, decilo así ("esto lo puede hacer X, que tiene Y conectado") en lugar de pedir credenciales. Mirá listar_pendientes antes de arrancar, porque lo que te falta puede estar ya contestado ahí; si resolviste uno, cerralo con cerrar_pendiente.`,
    // A link came back 403 because a manager retyped one character of a UUID,
    // and the company spent a whole corrida diagnosing an expiry that never
    // happened. Titles survive being written out by hand; ids and links do not.
    `Para hablar de un archivo usá su título, no su link ni su id. Si igual tenés que pasar un link, copialo entero y exacto: cambiar un carácter da un error que parece otra cosa. Y si un link falla, no supongas que se venció — fijate primero si está bien escrito y si el archivo ya está en la biblioteca.`,
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
- Si hay un archivo de por medio, nombralo por su título en la biblioteca. No copies links ni ids adentro del encargo.
- Máximo tres oraciones por encargo.`;
}

export function consolidatePrompt(
  task: string,
  answers: { agent: RunAgent; text: string }[],
  /** Roles whose work fell over, so the answer can admit the hole. */
  missing: string[] = [],
): string {
  const body = answers
    .map(
      (a) => `## ${a.agent.role}${a.agent.name ? ` — ${a.agent.name}` : ""}
${a.text}`,
    )
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
