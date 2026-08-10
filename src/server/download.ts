import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Room for a generated image or a spreadsheet, not for filling the disk. */
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_MB = MAX_BYTES / 1024 / 1024;
const TIMEOUT_MS = 30_000;
/** A CDN link costs a hop or two; a longer chain is a rabbit hole. */
const MAX_REDIRECTS = 4;

export interface Download {
  bytes: Buffer;
  mime: string;
  /** What the server called it, or the tail of the URL when it said nothing. */
  filename: string;
}

/**
 * The link comes from a model, and often from whatever a source told the model,
 * so it is the least trusted string in the app: left alone it would happily
 * fetch the cloud metadata endpoint or this very server's own API.
 */
function internal(address: string): boolean {
  if (isIP(address) === 6) {
    const v6 = address.toLowerCase();
    // An IPv4 address written the IPv6 way is still that address.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
    if (mapped?.[1]) return internal(mapped[1]);
    return (
      v6 === "::" ||
      v6 === "::1" ||
      // Unique local (fc00::/7) and link local (fe80::/10).
      /^f[cd]/.test(v6) ||
      /^fe[89ab]/.test(v6)
    );
  }

  const [a = -1, b = -1] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    // Carrier-grade NAT, and everything multicast or reserved above it.
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("sólo puedo bajar links http o https");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : await lookup(host, { all: true })
        .then((found) => found.map((entry) => entry.address))
        .catch(() => {
          throw new Error(`no existe el dominio ${host}`);
        });

  if (addresses.length === 0 || addresses.some(internal)) {
    throw new Error("ese link apunta a la red interna");
  }
}

/** The name a `content-disposition` gives, unquoted and stripped of any path. */
function named(disposition: string | null, url: URL): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? "");
  const raw = match?.[1] ?? url.pathname.split("/").pop() ?? "";
  return decodeURIComponent(raw).split(/[\\/]/).pop()?.slice(0, 160) ?? "";
}

/**
 * Pulls down whatever is behind a link. Redirects are followed by hand because
 * checking the first address is worth nothing if the hop after it is the one
 * that lands inside the network.
 */
export async function download(rawUrl: string): Promise<Download> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("eso no es una URL");
  }

  let response: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS && !response; hop += 1) {
    await assertPublic(url);
    const hit = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "*/*" },
    });
    const location = hit.headers.get("location");
    if (hit.status >= 300 && hit.status < 400 && location) {
      await hit.body?.cancel();
      url = new URL(location, url);
    } else {
      response = hit;
    }
  }

  if (!response) throw new Error("el link da vueltas entre redirecciones");
  if (!response.ok) throw new Error(`el link respondió ${response.status}`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
    throw new Error(`pesa más de ${MAX_MB} MB`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("el link no devolvió nada");

  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    // A missing or lying content-length is common, so this is the real cap.
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error(`pesa más de ${MAX_MB} MB`);
    }
    chunks.push(value);
  }

  return {
    bytes: Buffer.concat(chunks),
    mime:
      response.headers.get("content-type")?.split(";")[0]?.trim() ||
      "application/octet-stream",
    filename: named(response.headers.get("content-disposition"), url),
  };
}

const TEXTUAL = /^text\/|^application\/(json|xml|csv|x-ndjson)|\+(json|xml)$/;

/**
 * Text goes into the library as text, so search and `leer_archivo` find it the
 * same as anything an agent wrote. Bytes that only claim to be text are not:
 * a replacement character means the decode was a guess that failed.
 */
export function asText(file: Download): string | null {
  if (!TEXTUAL.test(file.mime)) return null;
  const text = file.bytes.toString("utf8");
  return text.includes("�") ? null : text;
}
