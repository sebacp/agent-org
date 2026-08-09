import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileFilter, FileMeta, FileRecord } from "@/lib/file-types";
import { isSafeId } from "@/lib/id";
import { publish } from "@/server/bus";

const ROOT = path.join(process.cwd(), ".data");

/**
 * Ids reach this module from model-authored tool arguments and from URL
 * params, so anything that isn't one of our own generated ids is refused
 * before it can be joined into a path.
 */
function assertSafe(value: string, label: string): string {
  if (!isSafeId(value)) throw new Error(`${label} inválido.`);
  return value;
}

function orgDir(orgId: string): string {
  return path.join(ROOT, assertSafe(orgId, "Id de empresa"));
}

function indexPath(orgId: string): string {
  return path.join(orgDir(orgId), "index.json");
}

function bodyPath(orgId: string, fileId: string): string {
  return path.join(
    orgDir(orgId),
    "archivos",
    `${assertSafe(fileId, "Id de archivo")}.md`,
  );
}

async function readIndex(orgId: string): Promise<FileMeta[]> {
  try {
    const raw = await readFile(indexPath(orgId), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FileMeta[]) : [];
  } catch {
    return [];
  }
}

// Every change to the library lands here, so this is where the open panes get
// told: an agent filing something mid-run is the common case.
async function writeIndex(orgId: string, entries: FileMeta[]): Promise<void> {
  await mkdir(orgDir(orgId), { recursive: true });
  await writeFile(indexPath(orgId), JSON.stringify(entries, null, 2), "utf8");
  publish(orgId, "files");
}

function matches(meta: FileMeta, filter: FileFilter, haystack: string): boolean {
  if (filter.area && meta.area !== filter.area) return false;
  if (filter.author && meta.author !== filter.author) return false;
  if (filter.tag && !meta.tags.includes(filter.tag)) return false;
  if (filter.query && !haystack.includes(filter.query.toLowerCase())) {
    return false;
  }
  return true;
}

/**
 * Search reads bodies only when there is a text query, so plain listing and
 * filtering stay a single index read.
 */
export async function listFiles(
  orgId: string,
  filter: FileFilter = {},
): Promise<FileMeta[]> {
  const index = await readIndex(orgId);
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const found: FileMeta[] = [];

  for (const meta of index) {
    let haystack = `${meta.title} ${meta.tags.join(" ")}`.toLowerCase();
    if (filter.query && !haystack.includes(filter.query.toLowerCase())) {
      haystack += ` ${(await loadBody(orgId, meta.id)).toLowerCase()}`;
    }
    if (matches(meta, filter, haystack)) found.push(meta);
    if (found.length >= limit) break;
  }

  return found;
}

async function loadBody(orgId: string, fileId: string): Promise<string> {
  try {
    return await readFile(bodyPath(orgId, fileId), "utf8");
  } catch {
    return "";
  }
}

export async function getFile(
  orgId: string,
  fileId: string,
): Promise<FileRecord | null> {
  const meta = (await readIndex(orgId)).find((m) => m.id === fileId);
  if (!meta) return null;
  return { ...meta, content: await loadBody(orgId, fileId) };
}

export async function saveFile(
  orgId: string,
  input: {
    title: string;
    content: string;
    author: string;
    area: string;
    tags?: string[];
  },
): Promise<FileMeta> {
  const meta: FileMeta = {
    id: randomUUID(),
    title: input.title.trim().slice(0, 160) || "Sin título",
    author: input.author,
    area: input.area,
    tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    chars: input.content.length,
    createdAt: new Date().toISOString(),
  };

  await mkdir(path.join(orgDir(orgId), "archivos"), { recursive: true });
  await writeFile(bodyPath(orgId, meta.id), input.content, "utf8");
  await writeIndex(orgId, [meta, ...(await readIndex(orgId))]);
  return meta;
}

export async function deleteFile(orgId: string, fileId: string): Promise<void> {
  await rm(bodyPath(orgId, fileId), { force: true });
  await writeIndex(
    orgId,
    (await readIndex(orgId)).filter((m) => m.id !== fileId),
  );
}

/** Dropping a company from the library takes its files with it. */
export async function deleteOrgFiles(orgId: string): Promise<void> {
  await rm(orgDir(orgId), { recursive: true, force: true });
}

export async function countFiles(orgId: string): Promise<number> {
  return (await readIndex(orgId)).length;
}

export async function listOrgIds(): Promise<string[]> {
  try {
    return await readdir(ROOT);
  } catch {
    return [];
  }
}
