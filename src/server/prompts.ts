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
): string {
  const blocks = [
    `Trabajás en ${company.name.trim() || "la compañía"}.`,
    company.purpose.trim(),
    department &&
      `Tu área es ${department.label}.\n${department.mission.trim()}`,
    `Tu rol es ${agent.role.trim() || "sin rol"}${
      agent.name.trim() ? ` (${agent.name.trim()})` : ""
    }.\n${agent.instructions.trim()}`,
    `La empresa tiene una biblioteca de archivos compartida. Antes de responder algo que ya podría estar escrito, buscá ahí con buscar_archivos o listar_archivos, y leé lo que sirva con leer_archivo. Si producís algo que valga la pena conservar (un plan, un análisis, un texto terminado), guardalo con guardar_archivo y mencioná en tu respuesta que lo guardaste. Para una respuesta corta no hace falta guardar nada.`,
    // Blocked agents used to write requirement documents that nobody could act
    // on, which is the failure this board exists to absorb.
    `Si te falta algo que no está en la biblioteca (un dato, un acceso, una decisión que no te toca), no escribas un documento pidiéndolo ni inventes el dato: dejalo anotado con crear_pendiente y seguí con la parte que sí podés resolver. Mirá listar_pendientes antes de arrancar, porque lo que te falta puede estar ya contestado ahí; si resolviste uno, cerralo con cerrar_pendiente.`,
    // The panel renders answers as plain text, so markdown would leak as literal
    // asterisks and hashes.
    "Escribís en español rioplatense. Sos concreto y no rellenás.\nEscribís en texto plano: nada de markdown, ni asteriscos ni almohadillas. Para enumerar usás guiones al principio de la línea.",
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

Escribí la respuesta final. Una sola postura, no un resumen de quién dijo qué.
Si hay contradicciones, resolvelas y decí con qué te quedás y por qué.`;
}
