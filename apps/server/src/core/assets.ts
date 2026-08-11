import { fileSize, type FileMeta } from "@agent-org/shared/file-types";
import { asText, download, type Download } from "./download";
import { findBySourceUrl, saveBinaryFile, saveFile } from "./files";

/** An extension is the one cheap sign that a link is a file and not a page. */
const ASSET =
  /\.(png|jpe?g|webp|gif|svg|bmp|tiff?|avif|mp4|webm|mov|mp3|wav|ogg|m4a|pdf|zip|csv|tsv|xlsx?|docx?|pptx?|glb|gltf|obj|stl)$/i;

const LINKS = /https?:\/\/[^\s"'<>)\]}]+/g;

/** A tool that answers with a whole gallery still shouldn't flood the library. */
const MAX_PER_CALL = 3;

const KIND: Record<string, string> = {
  image: "Imagen",
  video: "Video",
  audio: "Audio",
};

/** A CDN names things by hash, and a hash is not something anyone can search. */
function titleFor(file: Download, label: string): string {
  const stem = file.filename.replace(/\.[^.]+$/, "");
  if (stem && !/^[0-9a-f][0-9a-f-]{15,}$/i.test(stem) && !/^\d+$/.test(stem)) {
    return file.filename;
  }
  const kind =
    KIND[file.mime.split("/")[0] ?? ""] ??
    (file.mime === "application/pdf" ? "PDF" : "Archivo");
  return `${kind} de ${label}`;
}

export interface FiledAssets {
  /** The source's answer with every filed link swapped for its library title. */
  text: string;
  saved: FileMeta[];
}

/**
 * A signed URL is the most fragile thing a source hands back. It expires, and
 * well before that it has to survive being retyped by a model into an encargo
 * for somebody else — where one flipped character of a UUID becomes a 403 that
 * reads exactly like an expiry and sends the whole company chasing it.
 *
 * So anything a source returns as a file is pulled down the moment it appears,
 * and the link is taken out of the answer: what the model gets back is a title
 * in the library, which survives being retyped because it is words.
 */
export async function fileLinkedAssets(
  orgId: string,
  by: { role: string; department: string; label: string },
  text: string,
): Promise<FiledAssets> {
  const urls = [...new Set(text.match(LINKS) ?? [])]
    // Trailing punctuation belongs to the sentence, not to the link.
    .map((url) => url.replace(/[.,;:!?]+$/, ""))
    .filter((url) => {
      try {
        return ASSET.test(new URL(url).pathname);
      } catch {
        return false;
      }
    })
    .slice(0, MAX_PER_CALL);

  const saved: FileMeta[] = [];
  let out = text;

  for (const url of urls) {
    const meta = await keep(orgId, by, url);
    // A link that won't come down is left where it is: the agent can still see
    // it, name it, or retry with guardar_desde_link.
    if (!meta) continue;
    saved.push(meta);
    out = out.split(url).join(`«${meta.title}» (en la biblioteca)`);
  }

  if (saved.length === 0) return { text, saved };

  const list = saved
    .map((m) => `«${m.title}» (${m.mime ?? "texto"}, ${fileSize(m)})`)
    .join(", ");
  return {
    text: `${out}\n\n[Lo que esta fuente devolvió como archivo ya quedó guardado en la biblioteca: ${list}. Nombralo así, por el título. No hace falta el link, y no lo copies a mano.]`,
    saved,
  };
}

async function keep(
  orgId: string,
  by: { role: string; department: string; label: string },
  url: string,
): Promise<FileMeta | null> {
  const already = await findBySourceUrl(orgId, url);
  if (already) return already;

  let file: Download;
  try {
    file = await download(url);
  } catch {
    return null;
  }
  // A source that answers with an HTML error page still answers with a `.png`
  // in the path, so what came back has the last word on whether it is a file.
  if (file.mime.startsWith("text/html")) return null;

  const shared = {
    title: titleFor(file, by.label),
    author: by.role,
    area: by.department,
    sourceUrl: url,
  };
  const text = asText(file);
  return text === null
    ? saveBinaryFile(orgId, { ...shared, bytes: file.bytes, mime: file.mime })
    : saveFile(orgId, { ...shared, content: text });
}
