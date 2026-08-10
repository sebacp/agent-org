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
  createdAt: string;
}

export function isImage(meta: Pick<FileMeta, "mime">): boolean {
  return meta.mime?.startsWith("image/") ?? false;
}

/** Reads its size in the unit its body is actually measured in. */
export function fileSize(meta: Pick<FileMeta, "chars" | "mime">): string {
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
