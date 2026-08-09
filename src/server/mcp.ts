import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SOURCE_PREFIX, type SourceDef } from "@/lib/source-types";
import type { ToolSchema } from "@/server/tools";

/** A connected server holds a socket or a child process, so it doesn't linger. */
const IDLE_MS = 5 * 60_000;
const TOOLS_TTL_MS = 60_000;
const CALL_TIMEOUT_MS = 60_000;

/** A model can't read a database dump either, so a result comes back trimmed. */
const MAX_RESULT_CHARS = 40_000;

/** DeepSeek only accepts this shape for a function name. */
const CALLABLE = /^[a-zA-Z0-9_-]{1,64}$/;

interface Entry {
  print: string;
  client: Promise<Client>;
  tools?: { at: number; value: ToolSchema[] };
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
    source.token,
    source.command,
  ]);
}

async function connect(source: SourceDef): Promise<Client> {
  const client = new Client({ name: "agent-org", version: "1.0.0" });

  if (source.transport === "stdio") {
    const [command, ...args] = splitCommand(source.command);
    if (!command) throw new Error("La fuente no tiene comando.");
    await client.connect(new StdioClientTransport({ command, args }));
    return client;
  }

  if (!source.url) throw new Error("La fuente no tiene URL.");
  await client.connect(
    new StreamableHTTPClientTransport(new URL(source.url), {
      requestInit: source.token
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

  const entry: Entry = { print: print(source), client: connect(source) };
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

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: { readOnlyHint?: boolean };
}

/** Throws whatever the transport threw, so the caller can show a real reason. */
export async function listSourceTools(
  orgId: string,
  source: SourceDef,
): Promise<ToolSchema[]> {
  const entry = acquire(orgId, source);
  if (entry.tools && Date.now() - entry.tools.at < TOOLS_TTL_MS) {
    return entry.tools.value;
  }

  const client = await entry.client;
  const { tools } = (await client.listTools()) as unknown as {
    tools: McpTool[];
  };

  const value = tools
    .filter((tool) => !(source.readOnly && tool.annotations?.readOnlyHint === false))
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
    }))
    // A name the API would reject takes the whole request down with it.
    .filter((tool) => CALLABLE.test(tool.function.name));

  entry.tools = { at: Date.now(), value };
  return value;
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
