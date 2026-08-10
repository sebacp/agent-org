export interface FileMeta {
  id: string;
  title: string;
  /** Role of the agent that wrote it, so the library reads like a company's. */
  author: string;
  area: string;
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
  limit?: number;
}
