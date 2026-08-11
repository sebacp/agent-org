const ENDPOINT = "https://api.openai.com/v1/embeddings";

/**
 * What this has to rank is one company's own library — tens of documents, not
 * a corpus — so the small model is nowhere near the limiting factor, and it is
 * cheap enough that re-indexing on a whim costs nothing worth counting.
 */
const MODEL = "text-embedding-3-small";

/**
 * Shorter than the model's native 1536. Every vector is read back on every
 * search, so a third of the bytes is a third of the reading, and this model is
 * trained so that cutting the tail off leaves the ranking intact.
 */
export const DIMENSIONS = 512;

/** Per request. Well under the API's ceiling, and small enough to retry. */
const BATCH = 96;

export class EmbeddingError extends Error {}

/** Without a key there is nothing to embed with, and search stays literal. */
export function embeddingsReady(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

interface Response {
  data?: { embedding: number[] }[];
  error?: { message?: string };
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
    },
    body: JSON.stringify({ model: MODEL, input: texts, dimensions: DIMENSIONS }),
  });

  const body = (await response.json().catch(() => null)) as Response | null;
  if (!response.ok || !body?.data) {
    // The request carries the library's own text, and an error body can echo
    // it back, so only what the user can act on is repeated.
    console.error(`OpenAI embeddings ${response.status}: ${body?.error?.message ?? ""}`);
    throw new EmbeddingError(
      response.status === 401 || response.status === 403
        ? "La API key de OpenAI no es válida."
        : response.status === 429
          ? "OpenAI está limitando el ritmo."
          : `OpenAI respondió ${response.status}.`,
    );
  }
  return body.data.map((item) => item.embedding);
}

/** In the order they were given, however many requests that takes. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const vectors: number[][] = [];
  for (let at = 0; at < texts.length; at += BATCH) {
    vectors.push(...(await embedBatch(texts.slice(at, at + BATCH))));
  }
  return vectors;
}

/**
 * Base64 of the raw floats. A vector written as JSON numbers is six times the
 * bytes of the thing it describes, and this file is read whole on every search.
 */
export function packVector(vector: number[]): string {
  return Buffer.from(new Float32Array(vector).buffer).toString("base64");
}

export function unpackVector(packed: string): Float32Array {
  const bytes = Buffer.from(packed, "base64");
  // The buffer node hands back can be a view into a larger pool, so the offset
  // is not always zero and slicing by it is what keeps the floats aligned.
  return new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
}

/** Both sides come back normalised from the API, so this is the cosine. */
export function similarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}
