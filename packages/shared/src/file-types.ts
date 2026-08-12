export interface FileMeta {
  id: string;
  title: string;
  /** Role of the agent that wrote it, so the library reads like a company's. */
  author: string;
  area: string;
  /**
   * Where it sits on the shelf: "Finanzas/Reportes mensuales", or absent for
   * what nobody has filed yet. The folder is written on the file and nowhere
   * else, so there is no such thing as an empty one to clean up later.
   */
  folder?: string;
  tags: string[];
  /** How big the body is: characters when it is text, bytes when it isn't. */
  chars: number;
  /** Only on what came down a link as something other than text. */
  mime?: string;
  /** The link it came from, so the same one is never filed twice. */
  sourceUrl?: string;
  /**
   * Rows, on a body that is one JSON record per line. A dump of a source is
   * far past what fits in anybody's context, so it is queried, never read.
   */
  records?: number;
  /**
   * Where a dump stopped when it stopped early, so continuing it asks for the
   * page after the last one it got instead of starting over and filing every
   * record twice. Absent means the listing was walked to the end.
   */
  cursor?: string;
  /** Which argument that cursor goes in, when the dump had to work it out. */
  cursorArg?: string;
  /**
   * What was asked of the source, when the dump narrowed the listing instead of
   * taking all of it. A filter applied at the source leaves a complete-looking
   * file that only answers for part of the question, so what it was is written
   * on it: nothing else downstream can tell that anything was left out.
   */
  asked?: string;
  /**
   * Why a dump is short, when it is. A question asked of an incomplete dump
   * comes back with a figure that reads like a total and isn't, so the reason
   * travels with the file and every answer it gives has to repeat it.
   */
  partial?: string;
  createdAt: string;
}

export function isImage(meta: Pick<FileMeta, "mime">): boolean {
  return meta.mime?.startsWith("image/") ?? false;
}

export function isDataset(meta: Pick<FileMeta, "records">): boolean {
  return typeof meta.records === "number";
}

/** Reads its size in the unit its body is actually measured in. */
export function fileSize(
  meta: Pick<FileMeta, "chars" | "mime" | "records">,
): string {
  if (typeof meta.records === "number") {
    return `${meta.records.toLocaleString("es-AR")} registros`;
  }
  if (!meta.mime) return `${meta.chars} caracteres`;
  const kb = meta.chars / 1024;
  return kb >= 1024
    ? `${(kb / 1024).toFixed(1)} MB`
    : `${Math.max(Math.round(kb), 1)} KB`;
}

export interface FileRecord extends FileMeta {
  content: string;
}

export interface FileFilter {
  query?: string;
  area?: string;
  tag?: string;
  author?: string;
  /** That exact folder and not what hangs below it; "" is the root. */
  folder?: string;
  limit?: number;
}

/**
 * Two. A shelf you can take in at a glance beats a filing cabinet that is
 * perfectly organised and that nobody ever opens past the first drawer.
 */
export const FOLDER_DEPTH = 2;

const SEGMENT_CHARS = 40;

/** As it will be written: "/ Finanzas //reportes / " becomes "Finanzas/reportes". */
export function cleanFolder(raw: string): string {
  return raw
    .split("/")
    .map((part) => part.trim().replace(/\s+/g, " ").slice(0, SEGMENT_CHARS))
    .filter(Boolean)
    .slice(0, FOLDER_DEPTH)
    .join("/");
}

/** Two folders that read the same to a person are the same folder. */
export function folderKey(folder: string): string {
  return folder
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Every folder the paths imply, parents included, in reading order. */
export function folderTree(files: Pick<FileMeta, "folder">[]): string[] {
  const found = new Map<string, string>();
  for (const file of files) {
    const parts = cleanFolder(file.folder ?? "").split("/").filter(Boolean);
    for (let depth = 1; depth <= parts.length; depth += 1) {
      const path = parts.slice(0, depth).join("/");
      const key = folderKey(path);
      if (!found.has(key)) found.set(key, path);
    }
  }
  return [...found.values()].sort((a, b) => a.localeCompare(b, "es"));
}
