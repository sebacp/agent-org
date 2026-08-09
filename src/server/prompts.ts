import type { RunAgent } from "@/lib/run-types";
import type { CompanyProfile, DepartmentDef } from "@/lib/types";

/**
 * The three inheritance layers the wizard promises, in the order the UI shows
 * them: company purpose, then area mission, then the agent's own instructions.
 */
export function systemPrompt(
  agent: RunAgent,
  company: CompanyProfile,
  department: DepartmentDef | undefined,
  /** Labels of the data sources this agent was granted. */
  sources: string[] = [],
): string {
  const blocks = [
    `Trabajás en ${company.name.trim() || "la compañía"}.`,
    company.purpose.trim(),
    department &&
      `Tu área es ${department.label}.\n${department.mission.trim()}`,
    `Tu rol es ${agent.role.trim() || "sin rol"}${
      agent.name.trim() ? ` (${agent.name.trim()})` : ""
    }.\n${agent.instructions.trim()}`,
    `La empresa tiene una biblioteca de archivos compartida. Antes de responder algo que ya podría estar escrito, buscá ahí con buscar_archivos o listar_archivos, y leé lo que sirva con leer_archivo.`,
    agent.library.includes("write")
      ? `Si producís algo que valga la pena conservar (un plan, un análisis, un texto terminado), guardalo con guardar_archivo y mencioná en tu respuesta que lo guardaste. Para una respuesta corta no hace falta guardar nada.`
      : `No podés escribir en la biblioteca: devolvé el trabajo terminado en tu respuesta para que lo guarde quien corresponda.`,
    agent.library.includes("delete") &&
      `Podés borrar archivos con borrar_archivo, y eso no se deshace. Usalo sólo para lo que quedó mal o duplicado; ante la duda dejalo y decilo.`,
    sources.length > 0 &&
      `Tenés acceso a estas fuentes de datos: ${sources.join(", ")}. Sus herramientas empiezan con "fuente__", y sólo ves las funciones que te habilitaron: si necesitás una que no está, no la inventes, dejá un pendiente. Si lo que necesitás son datos reales, traelos de ahí en lugar de estimar; si la fuente no responde, decilo y seguí.`,
    // Blocked agents used to write requirement documents that nobody could act
    // on, which is the failure this board exists to absorb.
    `Si te falta algo que no está en la biblioteca (un dato, un acceso, una decisión que no te toca), no escribas un documento pidiéndolo ni inventes el dato: dejalo anotado con crear_pendiente y seguí con la parte que sí podés resolver. Mirá listar_pendientes antes de arrancar, porque lo que te falta puede estar ya contestado ahí; si resolviste uno, cerralo con cerrar_pendiente.`,
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

export function splitPrompt(task: string, reports: RunAgent[]): string {
  const roster = reports
    .map((r) => `- ${r.id} · ${r.role}${r.name ? ` (${r.name})` : ""}`)
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
