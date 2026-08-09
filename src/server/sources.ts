import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSafeId, newId } from "@/lib/id";
import type { SourceDef, SourceView } from "@/lib/source-types";

const ROOT = path.join(process.cwd(), ".data");

function sourcesPath(orgId: string): string {
  if (!isSafeId(orgId)) throw new Error("Id de empresa inválido.");
  return path.join(ROOT, orgId, "fuentes.json");
}

export async function listSources(orgId: string): Promise<SourceDef[]> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(sourcesPath(orgId), "utf8"),
    );
    return Array.isArray(parsed) ? (parsed as SourceDef[]) : [];
  } catch {
    return [];
  }
}

export function toView(source: SourceDef): SourceView {
  const { token, ...rest } = source;
  return { ...rest, hasToken: Boolean(token) };
}

async function write(orgId: string, sources: SourceDef[]): Promise<void> {
  await mkdir(path.dirname(sourcesPath(orgId)), { recursive: true });
  await writeFile(sourcesPath(orgId), JSON.stringify(sources, null, 2), "utf8");
}

export type SourceInput = Partial<Omit<SourceDef, "id">> & { id?: string };

/**
 * Creates or replaces one source. An empty `token` on an update keeps the one
 * already stored, so the browser never has to send the secret back.
 */
export async function saveSource(
  orgId: string,
  input: SourceInput,
): Promise<SourceDef> {
  const sources = await listSources(orgId);
  const previous = input.id ? sources.find((s) => s.id === input.id) : undefined;

  const saved: SourceDef = {
    id: previous?.id ?? newId("src"),
    label: (input.label ?? previous?.label ?? "").trim().slice(0, 80),
    transport: input.transport ?? previous?.transport ?? "http",
    url: (input.url ?? previous?.url ?? "").trim().slice(0, 500),
    token: input.token?.trim() || previous?.token || "",
    command: (input.command ?? previous?.command ?? "").trim().slice(0, 500),
    departments: (input.departments ?? previous?.departments ?? []).slice(0, 24),
    readOnly: input.readOnly ?? previous?.readOnly ?? true,
    enabled: input.enabled ?? previous?.enabled ?? true,
  };

  await write(
    orgId,
    previous
      ? sources.map((s) => (s.id === saved.id ? saved : s))
      : [...sources, saved],
  );
  return saved;
}

export async function deleteSource(orgId: string, id: string): Promise<void> {
  await write(
    orgId,
    (await listSources(orgId)).filter((s) => s.id !== id),
  );
}

/** The sources an agent in this area is allowed to reach. */
export async function sourcesForDepartment(
  orgId: string,
  department: string,
): Promise<SourceDef[]> {
  return (await listSources(orgId)).filter(
    (s) =>
      s.enabled &&
      (s.departments.length === 0 || s.departments.includes(department)),
  );
}
