import { randomUUID } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { FileFilter, FileMeta, FileRecord } from "@agent-org/shared/file-types";
import { isSafeId } from "@agent-org/shared/id";
import { publish } from "./bus";
import {
  DIMENSIONS,
  embed,
  embeddingsReady,
  packVector,
  similarity,
  unpackVector,
} from "./embeddings";

import { ROOT } from "./paths";

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

function thumbPath(orgId: string, fileId: string): string {
  return path.join(
    orgDir(orgId),
    "archivos",
    `${assertSafe(fileId, "Id de archivo")}.thumb.webp`,
  );
}

/** Big enough to still be sharp on a retina screen at the size it is shown. */
const THUMB_PX = 128;

/**
 * A square crop of an image, made the first time somebody asks for it and kept
 * from then on. Filing doesn't make it: an image already in the library from
 * before would never get one, and a company that never opens the biblioteca
 * would pay for every one it never looks at.
 */
export async function readThumb(
  orgId: string,
  fileId: string,
): Promise<Buffer | null> {
  const target = thumbPath(orgId, fileId);
  try {
    return await readFile(target);
  } catch {
    // Not made yet.
  }

  const bytes = await readFileBytes(orgId, fileId);
  if (!bytes) return null;

  try {
    const { default: sharp } = await import("sharp");
    const thumb = await sharp(bytes)
      .resize(THUMB_PX, THUMB_PX, { fit: "cover", position: "attention" })
      .webp({ quality: 72 })
      .toBuffer();
    await writeFile(target, thumb);
    return thumb;
  } catch {
    // An SVG, something truncated, a format this build wasn't compiled with:
    // the list falls back to the icon it drew before there were thumbnails.
    return null;
  }
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

/** The exact ones. They narrow the shelf; the query then ranks what is on it. */
function onShelf(meta: FileMeta, filter: FileFilter): boolean {
  if (filter.area && meta.area !== filter.area) return false;
  if (filter.author && meta.author !== filter.author) return false;
  if (filter.tag && !meta.tags.includes(filter.tag)) return false;
  return true;
}

/** Accents are half the words here and nobody types them the same way twice. */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function terms(query: string): string[] {
  return fold(query)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

/**
 * Every word somewhere in the file, rather than the phrase verbatim. An agent
 * asks in the language it thinks in — "listado de keywords" — and no document
 * has ever contained that as a run of characters.
 */
async function hasEveryWord(
  orgId: string,
  meta: FileMeta,
  words: string[],
): Promise<boolean> {
  if (words.length === 0) return false;
  const head = fold(`${meta.title} ${meta.tags.join(" ")}`);
  if (words.every((word) => head.includes(word))) return true;
  // A dump is megabytes of ids and amounts: reading it to grep for a word
  // costs a great deal and matches by accident. Its title is what it is.
  if (meta.records !== undefined || meta.mime) return false;
  const body = fold(await loadBody(orgId, meta.id));
  return words.every((word) => head.includes(word) || body.includes(word));
}

/**
 * How close a file has to be to the closest one to come back at all. This model
 * answers in a narrow band — measured against a real library, the least related
 * file it holds still scores .31 against a question it has nothing to do with —
 * so how near a file is to the best match says something, and the bare number
 * says almost nothing. Everything about as good as the best answer, and then it
 * stops: five documents about the question beat twelve about the subject.
 */
const MEANING_RATIO = 0.82;

/**
 * And a floor under that, because the ratio alone would always find something:
 * ask a library about a word it has never heard and the best match is still the
 * best of what is there.
 */
const MEANING_FLOOR = 0.3;

/**
 * What matching the words outright is worth against merely being about the
 * same thing. Enough to settle it when both are in the running, not enough to
 * put a passing mention above the document that answers the question.
 */
const LITERAL_BONUS = 0.2;

function vectorsPath(orgId: string): string {
  return path.join(orgDir(orgId), "vectores.json");
}

interface VectorEntry {
  /** What the file looked like when it was read, so a changed one is re-read. */
  hash: string;
  chunks: string[];
}

interface VectorStore {
  /** Vectors of one length can't be compared with vectors of another. */
  dims: number;
  entries: Record<string, VectorEntry>;
}

async function readVectors(orgId: string): Promise<VectorStore> {
  try {
    const raw = await readFile(vectorsPath(orgId), "utf8");
    const parsed = JSON.parse(raw) as VectorStore;
    if (parsed.dims !== DIMENSIONS) return { dims: DIMENSIONS, entries: {} };
    return { dims: DIMENSIONS, entries: parsed.entries ?? {} };
  } catch {
    return { dims: DIMENSIONS, entries: {} };
  }
}

/**
 * A document is written once and a dump only ever grows, so how long it is says
 * as much about whether it changed as reading it would.
 */
function fingerprint(meta: FileMeta): string {
  return `${meta.title}|${meta.tags.join(",")}|${meta.chars}|${meta.records ?? ""}`;
}

/** Long enough to hold an argument, short enough that one is all it holds. */
const CHUNK_CHARS = 1400;
/** Past this a document is being summarised by its opening, which is enough. */
const MAX_CHUNKS = 6;

/**
 * What gets read for meaning. The title and tags lead every piece, because a
 * page in the middle of a document rarely says again what the document is.
 */
async function passages(orgId: string, meta: FileMeta): Promise<string[]> {
  const head = `${meta.title}. ${meta.tags.join(", ")}`.trim();
  // A dump is ids and amounts, and a picture is not text at all: what either
  // one is about is what somebody named it.
  if (meta.records !== undefined || meta.mime) return [head];

  const body = await loadBody(orgId, meta.id);
  const chunks: string[] = [];
  for (
    let at = 0;
    at < body.length && chunks.length < MAX_CHUNKS;
    at += CHUNK_CHARS
  ) {
    chunks.push(`${head}\n\n${body.slice(at, at + CHUNK_CHARS)}`);
  }
  return chunks.length > 0 ? chunks : [head];
}

/** One catch-up at a time per company, however many searches ask for it. */
const indexing: Map<string, Promise<VectorStore>> = ((
  globalThis as { __fileVectors?: Map<string, Promise<VectorStore>> }
).__fileVectors ??= new Map());

/**
 * Brings the vectors level with the library and hands them back. Only what is
 * new or changed is sent, so the first search after a company has been running
 * a while pays for everything on the shelf and every one after it pays for
 * nothing.
 */
async function catchUp(orgId: string, shelf: FileMeta[]): Promise<VectorStore> {
  const store = await readVectors(orgId);
  const stale = shelf.filter(
    (meta) => store.entries[meta.id]?.hash !== fingerprint(meta),
  );
  if (stale.length === 0) return store;

  const texts: string[] = [];
  const spans: { id: string; hash: string; count: number }[] = [];
  for (const meta of stale) {
    const chunks = await passages(orgId, meta);
    texts.push(...chunks);
    spans.push({ id: meta.id, hash: fingerprint(meta), count: chunks.length });
  }

  const vectors = await embed(texts);
  let at = 0;
  for (const span of spans) {
    store.entries[span.id] = {
      hash: span.hash,
      chunks: vectors.slice(at, at + span.count).map(packVector),
    };
    at += span.count;
  }

  await mkdir(orgDir(orgId), { recursive: true });
  await writeFile(vectorsPath(orgId), JSON.stringify(store), "utf8");
  return store;
}

/**
 * How each file on the shelf compares to the question, or nothing at all when
 * there is no key to embed with or the API refused — in which case the search
 * falls back to reading the words, which is where it started.
 */
async function rankByMeaning(
  orgId: string,
  shelf: FileMeta[],
  query: string,
): Promise<Map<string, number> | null> {
  if (!embeddingsReady() || shelf.length === 0) return null;

  try {
    const pending = indexing.get(orgId) ?? Promise.resolve();
    const work = pending.then(
      () => catchUp(orgId, shelf),
      () => catchUp(orgId, shelf),
    );
    indexing.set(orgId, work);
    const store = await work;
    if (indexing.get(orgId) === work) indexing.delete(orgId);

    const [asked] = await embed([query]);
    if (!asked) return null;
    const wanted = new Float32Array(asked);

    const scores = new Map<string, number>();
    for (const meta of shelf) {
      const entry = store.entries[meta.id];
      if (!entry) continue;
      // The closest passage, not the average: a long document that answers the
      // question on one page is still the document that answers it.
      let best = 0;
      for (const packed of entry.chunks) {
        best = Math.max(best, similarity(wanted, unpackVector(packed)));
      }
      scores.set(meta.id, best);
    }
    return scores;
  } catch (error) {
    console.error(
      "Embeddings:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Ranked by what the query means, with anything that matches its words outright
 * kept regardless — so this is never worse at finding a file than reading the
 * words was, only better at finding the ones worded differently.
 */
export async function listFiles(
  orgId: string,
  filter: FileFilter = {},
): Promise<FileMeta[]> {
  const index = await readIndex(orgId);
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const shelf = index.filter((meta) => onShelf(meta, filter));
  if (!filter.query?.trim()) return shelf.slice(0, limit);

  const words = terms(filter.query);
  const literal = new Set<string>();
  for (const meta of shelf) {
    if (await hasEveryWord(orgId, meta, words)) literal.add(meta.id);
  }

  const meaning = await rankByMeaning(orgId, shelf, filter.query);
  if (!meaning)
    return shelf.filter((meta) => literal.has(meta.id)).slice(0, limit);

  const best = Math.max(...meaning.values(), 0);
  const near = Math.max(best * MEANING_RATIO, MEANING_FLOOR);

  return shelf
    .map((meta) => ({
      meta,
      score:
        (meaning.get(meta.id) ?? 0) +
        (literal.has(meta.id) ? LITERAL_BONUS : 0),
      kept: literal.has(meta.id) || (meaning.get(meta.id) ?? 0) >= near,
    }))
    .filter((row) => row.kept)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.meta);
}

async function loadBody(orgId: string, fileId: string): Promise<string> {
  try {
    return await readFile(bodyPath(orgId, fileId), "utf8");
  } catch {
    return "";
  }
}

/** A dump is megabytes. Enough of it to see what it is, and no more. */
const DATASET_PREVIEW_CHARS = 12_000;

export async function getFile(
  orgId: string,
  fileId: string,
): Promise<FileRecord | null> {
  const meta = (await readIndex(orgId)).find((m) => m.id === fileId);
  if (!meta) return null;
  // Bytes are not something to hand to whoever asked for the content; the mime
  // on the meta is what tells them to go get them properly.
  if (meta.mime) return { ...meta, content: "" };

  const body = await loadBody(orgId, fileId);
  return {
    ...meta,
    content:
      meta.records === undefined ? body : body.slice(0, DATASET_PREVIEW_CHARS),
  };
}

/** The whole body of a dump, for the one caller that queries it. */
export async function readDataset(
  orgId: string,
  fileId: string,
): Promise<string> {
  return loadBody(orgId, fileId);
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
  records?: number;
  asked?: string;
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
    ...(input.records === undefined ? {} : { records: input.records }),
    ...(input.asked ? { asked: input.asked } : {}),
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

/**
 * A dump arrives one page at a time and each page is meant to land beside the
 * last, so the file is found by the name the agent gave it rather than by an
 * id it would have to carry across calls.
 */
export async function findByTitle(
  orgId: string,
  title: string,
): Promise<FileMeta | null> {
  const wanted = title.trim().toLowerCase();
  return (
    (await readIndex(orgId)).find((m) => m.title.toLowerCase() === wanted) ??
    null
  );
}

/**
 * Rows onto the end of a dump, without reading back what is already there —
 * the whole point being that nothing ever holds the full thing except the
 * query. The index is left alone: a dump arrives as a hundred pages, and
 * rewriting it once per page would tell every open pane a hundred times.
 */
export async function appendDataset(
  orgId: string,
  fileId: string,
  body: string,
): Promise<void> {
  await appendFile(bodyPath(orgId, fileId), body, "utf8");
}

/**
 * The index catches up with the body once the dump stops growing, and records
 * whether it stopped because the listing ended or because it ran into a limit.
 * Both marks are rewritten every time, so finishing a dump that was cut short
 * clears the warning the cut left on it.
 */
export async function closeDataset(
  orgId: string,
  fileId: string,
  added: {
    chars: number;
    records: number;
    cursor: string | null;
    cursorArg: string | null;
    partial: string;
  },
): Promise<FileMeta | null> {
  const index = await readIndex(orgId);
  const meta = index.find((m) => m.id === fileId);
  if (!meta || meta.records === undefined) return null;

  const updated: FileMeta = {
    ...meta,
    chars: meta.chars + added.chars,
    records: meta.records + added.records,
  };
  if (added.partial) updated.partial = added.partial;
  else delete updated.partial;
  if (added.cursor && added.cursorArg) updated.cursorArg = added.cursorArg;
  else delete updated.cursorArg;
  if (added.cursor) updated.cursor = added.cursor;
  else delete updated.cursor;
  await writeIndex(
    orgId,
    index.map((m) => (m.id === fileId ? updated : m)),
  );
  return updated;
}

export async function deleteFile(orgId: string, fileId: string): Promise<void> {
  await rm(bodyPath(orgId, fileId), { force: true });
  await rm(bodyPath(orgId, fileId, true), { force: true });
  await rm(thumbPath(orgId, fileId), { force: true });
  await dropVector(orgId, fileId);
  await writeIndex(
    orgId,
    (await readIndex(orgId)).filter((m) => m.id !== fileId),
  );
}

/** Ids are never reused, but a stale vector would be read on every search. */
async function dropVector(orgId: string, fileId: string): Promise<void> {
  const store = await readVectors(orgId);
  if (!store.entries[fileId]) return;
  delete store.entries[fileId];
  await writeFile(vectorsPath(orgId), JSON.stringify(store), "utf8").catch(
    () => {},
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
