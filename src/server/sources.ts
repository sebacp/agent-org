import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isSafeId, newId } from "@/lib/id";
import type {
  AllowedSource,
  OAuthSession,
  SourceAuth,
  SourceDef,
  SourceGrant,
  SourceTool,
  SourceView,
} from "@/lib/source-types";

const ROOT = path.join(process.cwd(), ".data");

function sourcesPath(orgId: string): string {
  if (!isSafeId(orgId)) throw new Error("Id de empresa inválido.");
  return path.join(ROOT, orgId, "fuentes.json");
}

export async function listSources(orgId: string): Promise<SourceDef[]> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(sourcesPath(orgId), "utf8"),
    );
    if (!Array.isArray(parsed)) return [];
    // Sources stored before there was a choice only ever sent a bearer token.
    return (parsed as SourceDef[]).map((source) => ({
      ...source,
      auth: source.auth ?? (source.token ? "token" : "none"),
    }));
  } catch {
    return [];
  }
}

export async function readSource(
  orgId: string,
  id: string,
): Promise<SourceDef | undefined> {
  return (await listSources(orgId)).find((s) => s.id === id);
}

export function toView(source: SourceDef): SourceView {
  const { token, oauth, ...rest } = source;
  return {
    ...rest,
    hasToken: Boolean(token),
    connected: Boolean(oauth?.tokens),
    // Worth showing back: it's the one part of the session a person typed.
    clientId: oauth?.manual ? (oauth.clientId ?? "") : "",
  };
}

async function write(orgId: string, sources: SourceDef[]): Promise<void> {
  await mkdir(path.dirname(sourcesPath(orgId)), { recursive: true });
  await writeFile(sourcesPath(orgId), JSON.stringify(sources, null, 2), "utf8");
}

export type SourceInput = Partial<Omit<SourceDef, "id" | "oauth">> & {
  id?: string;
  /** Only read for `oauth`, and only where the service refuses to register us. */
  clientId?: string;
  clientSecret?: string;
};

/**
 * Carries the session forward across an edit. Typing a different client id is
 * how you start over, since it means the old registration is the wrong one.
 */
function nextSession(
  input: SourceInput,
  previous: OAuthSession | undefined,
): OAuthSession {
  const clientId = input.clientId?.trim();
  if (clientId === undefined) return previous ?? {};
  if (clientId === "") return previous?.manual ? {} : (previous ?? {});
  if (clientId === previous?.clientId) {
    return {
      ...previous,
      clientSecret: input.clientSecret?.trim() || previous.clientSecret,
      manual: true,
    };
  }
  return { clientId, clientSecret: input.clientSecret?.trim(), manual: true };
}

/**
 * Creates or replaces one source. An empty `token` on an update keeps the one
 * already stored, so the browser never has to send the secret back.
 */
export async function saveSource(
  orgId: string,
  input: SourceInput,
): Promise<SourceDef> {
  const sources = await listSources(orgId);
  const previous = input.id ? sources.find((s) => s.id === input.id) : undefined;

  // Sources saved before there was anything to choose only ever used a token.
  const auth: SourceAuth =
    input.auth ?? previous?.auth ?? (previous?.token ? "token" : "none");
  const url = (input.url ?? previous?.url ?? "").trim().slice(0, 500);
  // A session belongs to one endpoint under one scheme; move either and what
  // was granted no longer describes anything.
  const carried =
    previous && previous.url === url && previous.auth === auth
      ? previous.oauth
      : undefined;

  const saved: SourceDef = {
    id: previous?.id ?? newId("src"),
    label: (input.label ?? previous?.label ?? "").trim().slice(0, 80),
    transport: input.transport ?? previous?.transport ?? "http",
    url,
    auth,
    token: input.token?.trim() || previous?.token || "",
    ...(auth === "oauth" ? { oauth: nextSession(input, carried) } : {}),
    command: (input.command ?? previous?.command ?? "").trim().slice(0, 500),
    enabled: input.enabled ?? previous?.enabled ?? true,
    tools: input.tools ?? previous?.tools ?? [],
  };

  await write(
    orgId,
    previous
      ? sources.map((s) => (s.id === saved.id ? saved : s))
      : [...sources, saved],
  );
  return saved;
}

/**
 * Connecting is the only thing that knows what a source offers, so the probe
 * writes the list back here for the agent sheet to pick from later.
 */
export async function setSourceTools(
  orgId: string,
  id: string,
  tools: SourceTool[],
): Promise<SourceDef | null> {
  const sources = await listSources(orgId);
  const previous = sources.find((s) => s.id === id);
  if (!previous) return null;
  const saved: SourceDef = { ...previous, tools };
  await write(orgId, sources.map((s) => (s.id === id ? saved : s)));
  return saved;
}

/**
 * Merges into the stored OAuth session. The flow writes to it from several
 * steps — registration, the verifier, the tokens, then every refresh — and
 * each one only knows its own piece.
 */
export async function patchOAuth(
  orgId: string,
  id: string,
  patch: Partial<OAuthSession>,
): Promise<void> {
  const sources = await listSources(orgId);
  const previous = sources.find((s) => s.id === id);
  if (!previous) return;
  const saved: SourceDef = {
    ...previous,
    oauth: { ...previous.oauth, ...patch },
  };
  await write(
    orgId,
    sources.map((s) => (s.id === id ? saved : s)),
  );
}

export async function deleteSource(orgId: string, id: string): Promise<void> {
  await write(
    orgId,
    (await listSources(orgId)).filter((s) => s.id !== id),
  );
}

/**
 * What every agent was granted, each source cut down to the tools that one may
 * call. The whole company is resolved at once because a corrida needs more than
 * the running agent's own share: its prompt names who else holds what.
 */
export async function accessByAgent(
  orgId: string,
  agents: { id: string; sources: SourceGrant[] }[],
): Promise<Map<string, AllowedSource[]>> {
  const byId = new Map((await listSources(orgId)).map((s) => [s.id, s]));
  return new Map(
    agents.map((agent) => [
      agent.id,
      agent.sources.flatMap((grant) => {
        const source = byId.get(grant.sourceId);
        if (!source?.enabled || grant.tools.length === 0) return [];
        return [{ ...source, allowed: grant.tools }];
      }),
    ]),
  );
}
