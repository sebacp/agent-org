import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  SOURCE_PREFIX,
  type AllowedSource,
  type SourceDef,
  type SourceTool,
} from "@/lib/source-types";
import { providerFor } from "@/server/oauth";
import type { ToolSchema } from "@/server/tools";

/** A connected server holds a socket or a child process, so it doesn't linger. */
const IDLE_MS = 5 * 60_000;
const TOOLS_TTL_MS = 60_000;
/** A server that keeps handing out cursors would otherwise loop forever. */
const MAX_TOOL_PAGES = 20;
const CALL_TIMEOUT_MS = 60_000;

/** A model can't read a database dump either, so a result comes back trimmed. */
const MAX_RESULT_CHARS = 40_000;

/** DeepSeek only accepts this shape for a function name. */
const CALLABLE = /^[a-zA-Z0-9_-]{1,64}$/;

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: { readOnlyHint?: boolean };
}

interface Entry {
  print: string;
  client: Promise<Client>;
  tools?: { at: number; value: McpTool[] };
  timer?: NodeJS.Timeout;
}

// Dev reloads this module on every edit, which would strand the live clients.
const pool: Map<string, Entry> = ((
  globalThis as { __mcpPool?: Map<string, Entry> }
).__mcpPool ??= new Map());

/** Splits a typed command line, keeping quoted arguments in one piece. */
function splitCommand(line: string): string[] {
  return (line.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((part) =>
    part.replace(/^["']|["']$/g, ""),
  );
}

function print(source: SourceDef): string {
  return JSON.stringify([
    source.transport,
    source.url,
    source.auth,
    source.token,
    source.command,
  ]);
}

async function connect(orgId: string, source: SourceDef): Promise<Client> {
  const client = new Client({ name: "agent-org", version: "1.0.0" });

  if (source.transport === "stdio") {
    const [command, ...args] = splitCommand(source.command);
    if (!command) throw new Error("La fuente no tiene comando.");
    await client.connect(new StdioClientTransport({ command, args }));
    return client;
  }

  if (!source.url) throw new Error("La fuente no tiene URL.");
  // With a provider the transport refreshes an expired token on its own, which
  // is the whole point of storing the refresh token.
  await client.connect(
    new StreamableHTTPClientTransport(new URL(source.url), {
      authProvider:
        source.auth === "oauth" ? providerFor(orgId, source.id) : undefined,
      requestInit:
        source.auth === "token" && source.token
          ? { headers: { Authorization: `Bearer ${source.token}` } }
          : undefined,
    }),
  );
  return client;
}

function scheduleClose(key: string, entry: Entry): void {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    if (pool.get(key) === entry) pool.delete(key);
    void entry.client.then((c) => c.close()).catch(() => {});
  }, IDLE_MS);
  entry.timer.unref();
}

function acquire(orgId: string, source: SourceDef): Entry {
  const key = `${orgId}::${source.id}`;
  const existing = pool.get(key);
  if (existing && existing.print === print(source)) {
    scheduleClose(key, existing);
    return existing;
  }
  if (existing) closeSource(orgId, source.id);

  const entry: Entry = { print: print(source), client: connect(orgId, source) };
  pool.set(key, entry);
  // A server that refused the connection shouldn't poison the next attempt.
  entry.client.catch(() => {
    if (pool.get(key) === entry) pool.delete(key);
  });
  scheduleClose(key, entry);
  return entry;
}

export function closeSource(orgId: string, sourceId: string): void {
  const key = `${orgId}::${sourceId}`;
  const entry = pool.get(key);
  if (!entry) return;
  pool.delete(key);
  if (entry.timer) clearTimeout(entry.timer);
  void entry.client.then((c) => c.close()).catch(() => {});
}

export function toolName(sourceId: string, tool: string): string {
  return `${SOURCE_PREFIX}${sourceId}__${tool}`;
}

/** The inverse of `toolName`; the source id never contains a double underscore. */
export function parseToolName(
  name: string,
): { sourceId: string; tool: string } | null {
  if (!name.startsWith(SOURCE_PREFIX)) return null;
  const rest = name.slice(SOURCE_PREFIX.length);
  const cut = rest.indexOf("__");
  if (cut <= 0) return null;
  return { sourceId: rest.slice(0, cut), tool: rest.slice(cut + 2) };
}

/** Throws whatever the transport threw, so the caller can show a real reason. */
async function discover(
  orgId: string,
  source: SourceDef,
): Promise<McpTool[]> {
  const entry = acquire(orgId, source);
  if (entry.tools && Date.now() - entry.tools.at < TOOLS_TTL_MS) {
    return entry.tools.value;
  }

  const client = await entry.client;
  // A big server answers in pages, and stopping at the first one would hide the
  // rest of its functions without ever looking like a failure.
  const tools: McpTool[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
    const result = (await client.listTools(
      cursor ? { cursor } : {},
    )) as unknown as { tools: McpTool[]; nextCursor?: string };
    tools.push(...result.tools);
    cursor = result.nextCursor;
    if (!cursor) break;
  }

  // A name the API would reject takes the whole request down with it, and one
  // nobody can call has no business showing up in the picker either.
  const value = tools.filter((tool) =>
    CALLABLE.test(toolName(source.id, tool.name)),
  );
  entry.tools = { at: Date.now(), value };
  return value;
}

/** What the source offers, in the shape the editor lists and stores. */
export async function listSourceTools(
  orgId: string,
  source: SourceDef,
): Promise<SourceTool[]> {
  return (await discover(orgId, source)).map((tool) => ({
    name: tool.name,
    description: (tool.description ?? "").trim().slice(0, 300),
    readOnly: tool.annotations?.readOnlyHint === true,
  }));
}

/** Only what this agent was granted, in the shape DeepSeek takes. */
export async function grantedToolSchemas(
  orgId: string,
  source: AllowedSource,
): Promise<ToolSchema[]> {
  const allowed = new Set(source.allowed);
  return (await discover(orgId, source))
    .filter((tool) => allowed.has(tool.name))
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: toolName(source.id, tool.name),
        description: `[${source.label || "fuente"}] ${tool.description ?? ""}`
          .trim()
          .slice(0, 1000),
        parameters: (tool.inputSchema as Record<string, unknown>) ?? {
          type: "object",
          properties: {},
        },
      },
    }));
}

interface McpContent {
  type: string;
  text?: string;
}

export async function callSourceTool(
  orgId: string,
  source: SourceDef,
  tool: string,
  args: Record<string, unknown>,
): Promise<string> {
  const client = await acquire(orgId, source).client;
  const result = (await client.callTool({ name: tool, arguments: args }, undefined, {
    timeout: CALL_TIMEOUT_MS,
  })) as unknown as { content?: McpContent[]; isError?: boolean };

  const text = (result.content ?? [])
    .map((part) => (part.type === "text" ? (part.text ?? "") : `[${part.type}]`))
    .join("\n")
    .trim();

  if (!text) return result.isError ? "La fuente devolvió un error vacío." : "Sin resultados.";
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}\n\n[Corté acá: la respuesta tiene ${text.length} caracteres.]`
    : text;
}
