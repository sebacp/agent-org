export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Org, thread and file ids become path segments in the server-side store, so
 * anything outside this alphabet is refused before it can be joined into a
 * path. Dots are excluded, which is what keeps `..` out.
 */
export const SAFE_ID = /^[a-z0-9_-]{1,64}$/i;

export function isSafeId(value: string): boolean {
  return SAFE_ID.test(value);
}
