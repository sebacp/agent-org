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

/** Text and bytes live side by side under the id; the suffix says which it is. */
function bodyPath(orgId: string, fileId: string, binary = false): string {
  return path.join(
    orgDir(orgId),
    "archivos",
    `${assertSafe(fileId, "Id de archivo")}${binary ? ".bin" : ".md"}`,
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
  // Bytes are not something to hand to whoever asked for the content; the mime
  // on the meta is what tells them to go get them properly.
  return {
    ...meta,
    content: meta.mime ? "" : await loadBody(orgId, fileId),
  };
}

/** The body of a file that isn't text, for serving it back as what it is. */
export async function readFileBytes(
  orgId: string,
  fileId: string,
): Promise<Buffer | null> {
  try {
    return await readFile(bodyPath(orgId, fileId, true));
  } catch {
    return null;
  }
}

interface FileInput {
  title: string;
  author: string;
  area: string;
  tags?: string[];
  sourceUrl?: string;
}

/**
 * A source polled for the same generation answers with the same link every
 * time, and an agent can be told to file something that is already filed.
 */
export async function findBySourceUrl(
  orgId: string,
  url: string,
): Promise<FileMeta | null> {
  return (await readIndex(orgId)).find((m) => m.sourceUrl === url) ?? null;
}

function newMeta(input: FileInput, chars: number, mime?: string): FileMeta {
  return {
    id: randomUUID(),
    title: input.title.trim().slice(0, 160) || "Sin título",
    author: input.author,
    area: input.area,
    tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    chars,
    ...(mime ? { mime } : {}),
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    createdAt: new Date().toISOString(),
  };
}

async function store(
  orgId: string,
  meta: FileMeta,
  body: string | Buffer,
): Promise<FileMeta> {
  await mkdir(path.join(orgDir(orgId), "archivos"), { recursive: true });
  const target = bodyPath(orgId, meta.id, Boolean(meta.mime));
  if (typeof body === "string") await writeFile(target, body, "utf8");
  else await writeFile(target, body);
  await writeIndex(orgId, [meta, ...(await readIndex(orgId))]);
  return meta;
}

export async function saveFile(
  orgId: string,
  input: FileInput & { content: string },
): Promise<FileMeta> {
  return store(orgId, newMeta(input, input.content.length), input.content);
}

/**
 * Something that isn't prose — an image a source generated, a PDF — filed in
 * the same library beside what the agents wrote. Nothing that reads text out of
 * the library will find anything in it, which is what the mime is there to say.
 */
export async function saveBinaryFile(
  orgId: string,
  input: FileInput & { bytes: Buffer; mime: string },
): Promise<FileMeta> {
  return store(
    orgId,
    newMeta(input, input.bytes.byteLength, input.mime),
    input.bytes,
  );
}

export async function deleteFile(orgId: string, fileId: string): Promise<void> {
  await rm(bodyPath(orgId, fileId), { force: true });
  await rm(bodyPath(orgId, fileId, true), { force: true });
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
