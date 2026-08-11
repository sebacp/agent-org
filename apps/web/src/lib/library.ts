import { newId } from "@agent-org/shared/id";
import { isOrgChartFile, migrateOrgFile, toOrgFile } from "@/lib/storage";
import type { OrgState } from "@/lib/seed";
import type { OrgChartFile } from "@agent-org/shared/types";

const INDEX_KEY = "agent-org:index:v1";
const ORG_PREFIX = "agent-org:org:";

/** Single-org keys used before the library existed. */
const LEGACY_ORG_KEY = "agent-org:v1";
const LEGACY_STEP_KEY = "agent-org:step";

/**
 * The card the library renders. Everything here is derived from the org file,
 * so the index is a cache: if it disagrees with the file, the file wins.
 */
export interface LibraryEntry {
  id: string;
  name: string;
  agents: number;
  areas: number;
  savedAt: string;
  /** Which editor section to reopen on, so you land where you left off. */
  step: number;
}

function orgKey(id: string): string {
  return `${ORG_PREFIX}${id}`;
}

function readIndex(): LibraryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(INDEX_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is LibraryEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as LibraryEntry).id === "string",
    );
  } catch {
    return [];
  }
}

function writeIndex(entries: LibraryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Quota or private mode: the editor keeps working in memory.
  }
}

function entryFor(id: string, file: OrgChartFile, step: number): LibraryEntry {
  return {
    id,
    name: file.company.name.trim(),
    agents: file.nodes.length,
    areas: file.departments.length,
    savedAt: file.savedAt,
    step,
  };
}

/**
 * The pre-library org lived under a fixed key. It becomes the first entry so
 * upgrading doesn't look like the user's work was thrown away.
 */
function adoptLegacyOrg(): void {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(LEGACY_ORG_KEY);
  if (!raw) return;
  window.localStorage.removeItem(LEGACY_ORG_KEY);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isOrgChartFile(parsed)) return;
    const step = Number(window.localStorage.getItem(LEGACY_STEP_KEY));
    saveOrgFile(
      newId("org"),
      migrateOrgFile(parsed),
      step >= 1 && step <= 5 ? step : 5,
    );
  } catch {
    // A corrupt legacy blob is simply dropped.
  } finally {
    window.localStorage.removeItem(LEGACY_STEP_KEY);
  }
}

/** Most recently saved first, which is the order the library shows. */
export function listOrgs(): LibraryEntry[] {
  adoptLegacyOrg();
  return readIndex().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function readOrg(id: string): OrgChartFile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(orgKey(id));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isOrgChartFile(parsed) ? migrateOrgFile(parsed) : null;
  } catch {
    return null;
  }
}

export function saveOrgFile(
  id: string,
  file: OrgChartFile,
  step?: number,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(orgKey(id), JSON.stringify(file));
  } catch {
    return;
  }
  const index = readIndex();
  const previous = index.find((e) => e.id === id);
  const entry = entryFor(id, file, step ?? previous?.step ?? 1);
  writeIndex([...index.filter((e) => e.id !== id), entry]);
}

export function saveOrgState(id: string, state: OrgState): void {
  saveOrgFile(
    id,
    toOrgFile(state.company, state.departments, state.nodes, state.edges),
  );
}

/** Returns the id of the new company so the caller can navigate straight in. */
export function createOrg(state: OrgState, step = 1): string {
  const id = newId("org");
  saveOrgFile(
    id,
    toOrgFile(state.company, state.departments, state.nodes, state.edges),
    step,
  );
  return id;
}

export function createOrgFromFile(file: OrgChartFile): string {
  const id = newId("org");
  saveOrgFile(id, file, 5);
  return id;
}

export function removeOrg(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(orgKey(id));
  writeIndex(readIndex().filter((e) => e.id !== id));
}

export function readStep(id: string, fallback: number): number {
  const step = readIndex().find((e) => e.id === id)?.step;
  return step && step >= 1 && step <= 5 ? step : fallback;
}

export function writeStep(id: string, step: number): void {
  const index = readIndex();
  const entry = index.find((e) => e.id === id);
  if (!entry) return;
  writeIndex(index.map((e) => (e.id === id ? { ...e, step } : e)));
}
