import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSafeId } from "@/lib/id";
import { coerceModel } from "@/lib/models";
import { RUN_LIMITS, type OrgSnapshot, type RunAgent } from "@/lib/run-types";
import type { SourceGrant } from "@/lib/source-types";
import type { LibraryPermission } from "@/lib/types";

const ROOT = path.join(process.cwd(), ".data");

function orgPath(orgId: string): string {
  if (!isSafeId(orgId)) throw new Error("Id de empresa inválido.");
  return path.join(ROOT, orgId, "organigrama.json");
}

/** When the browser last mirrored it, which is how stale a run can be. */
export interface StoredOrg extends OrgSnapshot {
  savedAt: string;
}

export function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** A grant with no tools reaches nothing, so it is dropped rather than kept. */
function grants(value: unknown): SourceGrant[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      const sourceId = text(raw.sourceId, 64);
      const tools = Array.isArray(raw.tools)
        ? raw.tools
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.slice(0, 120))
            .slice(0, 200)
        : [];
      return sourceId && tools.length > 0 ? [{ sourceId, tools }] : [];
    })
    .slice(0, 24);
}

/** Reading is everyone's; the two that change the library have to be granted. */
function permissions(value: unknown): LibraryPermission[] {
  if (!Array.isArray(value)) return [];
  return (["write", "delete"] as const).filter((name) => value.includes(name));
}

/**
 * The org chart arrives from the browser both to run and to be mirrored, and
 * neither is trusted. Throws with a message meant for the user.
 */
export function parseSnapshot(body: unknown): OrgSnapshot {
  if (typeof body !== "object" || body === null)
    throw new Error("Pedido vacío.");
  const raw = body as Record<string, unknown>;

  if (!Array.isArray(raw.agents) || raw.agents.length === 0) {
    throw new Error("El organigrama no tiene agentes.");
  }
  if (raw.agents.length > RUN_LIMITS.maxAgents) {
    throw new Error(
      `El organigrama supera los ${RUN_LIMITS.maxAgents} agentes por corrida.`,
    );
  }

  const agents: RunAgent[] = raw.agents.map((item) => {
    const a = item as Record<string, unknown>;
    return {
      id: text(a.id, 64),
      role: text(a.role, 120),
      name: text(a.name, 120),
      department: text(a.department, 64),
      instructions: text(a.instructions, RUN_LIMITS.maxInstructionChars),
      model: coerceModel(a.model),
      sources: grants(a.sources),
      library: permissions(a.library),
    };
  });

  const ids = new Set(agents.map((a) => a.id));
  const rootId = text(raw.rootId, 64);
  if (!ids.has(rootId)) throw new Error("No se encontró el agente raíz.");

  const reports: Record<string, string[]> = {};
  const rawReports = (raw.reports ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(rawReports)) {
    if (!ids.has(key) || !Array.isArray(value)) continue;
    reports[key] = value.filter(
      (id): id is string => typeof id === "string" && ids.has(id),
    );
  }

  const company = (raw.company ?? {}) as Record<string, unknown>;
  const departments = Array.isArray(raw.departments) ? raw.departments : [];

  return {
    company: {
      name: text(company.name, 200),
      purpose: text(company.purpose, RUN_LIMITS.maxInstructionChars),
    },
    departments: departments.map((item) => {
      const d = item as Record<string, unknown>;
      return {
        id: text(d.id, 64),
        label: text(d.label, 120),
        mission: text(d.mission, RUN_LIMITS.maxInstructionChars),
      };
    }),
    agents,
    reports,
    rootId,
  };
}

export async function readOrg(orgId: string): Promise<StoredOrg | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(orgPath(orgId), "utf8"));
    const org = parseSnapshot(parsed);
    const savedAt = text((parsed as Record<string, unknown>).savedAt, 40);
    return { ...org, savedAt };
  } catch {
    return null;
  }
}

export async function writeOrg(
  orgId: string,
  snapshot: OrgSnapshot,
): Promise<StoredOrg> {
  const stored: StoredOrg = { ...snapshot, savedAt: new Date().toISOString() };
  await mkdir(path.dirname(orgPath(orgId)), { recursive: true });
  await writeFile(orgPath(orgId), JSON.stringify(stored, null, 2), "utf8");
  return stored;
}
