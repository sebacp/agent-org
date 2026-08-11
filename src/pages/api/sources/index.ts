import type { NextApiRequest, NextApiResponse } from "next";
import type { SourceDef, SourceProbe } from "@/lib/source-types";
import { closeSource, listSourceTools } from "@/server/mcp";
import { authorize, rememberOrigin } from "@/server/oauth";
import {
  deleteSource,
  listSources,
  readSource,
  saveSource,
  setSourceTools,
  toView,
  type SourceInput,
} from "@/server/sources";

/** Connecting is the only honest test, so saving one always tries it. */
async function probe(orgId: string, source: SourceDef): Promise<SourceProbe> {
  // A source that is off keeps whatever it last reported, so turning it back on
  // doesn't wipe the grants pointing at its tools.
  if (!source.enabled) return { tools: source.tools };

  // Nobody signed in yet, so asking the server anything would only earn a 401.
  if (source.auth === "oauth" && !source.oauth?.tokens) {
    return { tools: [], authUrl: await authorize(orgId, source) };
  }

  try {
    return { tools: await listSourceTools(orgId, source) };
  } catch (error) {
    // A refresh token dies eventually, and when it does the way out is to sign
    // in again rather than to read an error nobody can act on.
    if (source.auth === "oauth") {
      const retry = await authorize(orgId, source).catch(() => "");
      if (retry) return { tools: [], authUrl: retry };
    }
    return {
      tools: [],
      error: error instanceof Error ? error.message : "No pude conectar.",
    };
  }
}

function parseBody(body: unknown): SourceInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  const text = (value: unknown) =>
    typeof value === "string" ? value : undefined;
  return {
    id: text(raw.id),
    label: text(raw.label),
    // Left undefined when absent, so a bare `{ id }` post is just a re-probe.
    transport:
      raw.transport === "stdio"
        ? "stdio"
        : raw.transport === "http"
          ? "http"
          : undefined,
    url: text(raw.url),
    auth:
      raw.auth === "oauth" || raw.auth === "token" || raw.auth === "none"
        ? raw.auth
        : undefined,
    token: text(raw.token),
    clientId: text(raw.clientId),
    clientSecret: text(raw.clientSecret),
    command: text(raw.command),
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
    // The tool list is never taken from the browser: only a real connection
    // gets to say what a source offers.
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { orgId, id } = req.query;
  if (typeof orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }
  rememberOrigin(req);

  try {
    if (req.method === "DELETE") {
      if (typeof id !== "string") {
        res.status(400).json({ error: "Falta la fuente." });
        return;
      }
      closeSource(orgId, id);
      await deleteSource(orgId, id);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "POST") {
      const source = await saveSource(orgId, parseBody(req.body));
      // Editing the connection details invalidates whatever was open.
      closeSource(orgId, source.id);
      const result = await probe(orgId, source);
      // One still waiting on a sign-in has nothing new to say, and the list it
      // reported last time is still the truest answer available.
      const stored =
        result.error || result.authUrl
          ? ((await readSource(orgId, source.id)) ?? source)
          : ((await setSourceTools(orgId, source.id, result.tools)) ?? source);
      res.status(200).json({ source: toView(stored), probe: result });
      return;
    }

    res.status(200).json({
      sources: (await listSources(orgId)).map(toView),
    });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "No pude leer las fuentes.",
    });
  }
}
