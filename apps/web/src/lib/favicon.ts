/**
 * An MCP endpoint almost never lives on the apex domain, and the icon service
 * only knows the brand there: `mcp.stripe.com` has no icon, `stripe.com` does.
 */
const SERVICE_LABELS = new Set(["mcp", "api", "server", "www"]);

/** The brand behind an MCP endpoint, or empty when there is no usable URL. */
export function faviconDomain(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return "";
  }
  const [first, ...rest] = host.split(".");
  // Only a known prefix is dropped: cutting to the last two labels would turn
  // `foo.example.co.uk` into `co.uk`.
  return rest.length >= 2 && SERVICE_LABELS.has(first) ? rest.join(".") : host;
}

/**
 * DuckDuckGo rather than Google: Google's service answers every domain, but
 * for these hosts what it answers is the same generic globe.
 */
export function faviconUrl(url: string): string {
  const domain = faviconDomain(url);
  return domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : "";
}
