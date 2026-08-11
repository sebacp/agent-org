import { Router, json } from "express";
import type { SourceDef, SourceProbe } from "@agent-org/shared/source-types";
import { closeSource, listSourceTools } from "../core/mcp";
import { authorize, parseState, rememberOrigin } from "../core/oauth";
import {
  deleteSource,
  listSources,
  patchOAuth,
  readSource,
  saveSource,
  setSourceTools,
  toView,
  type SourceInput,
} from "../core/sources";

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

function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char,
  );
}

/**
 * The tab that opened this one is the one showing the source, so it gets told
 * to look again instead of leaving a stale card behind.
 */
function page(heading: string, detail: string, sourceId?: string): string {
  return `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(heading)}</title>
<style>
  html { color-scheme: dark; }
  body { margin: 0; display: grid; place-items: center; height: 100vh;
         background: #121210; color: #fbfaf6;
         font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  div { max-width: 30rem; padding: 0 2rem; text-align: center; }
  p { margin: .5rem 0 0; color: #bcb9ae; font-size: 13px; }
</style>
<div><strong>${escape(heading)}</strong><p>${escape(detail)}</p></div>
<script>
  try {
    window.opener?.postMessage(
      { tag: "agent-org-oauth", sourceId: ${JSON.stringify(sourceId ?? "")} },
      window.location.origin,
    );
  } catch {}
  ${sourceId ? "setTimeout(() => window.close(), 600);" : ""}
</script>
</html>`;
}

export const sourcesRouter = Router();

sourcesRouter.use(json({ limit: "1mb" }));

/** Where the browser lands after signing in at whoever owns the source. */
sourcesRouter.get("/oauth", async (req, res) => {
  rememberOrigin(req);
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  const value = (key: string) => {
    const raw = req.query[key];
    return typeof raw === "string" ? raw : undefined;
  };

  const denied = value("error");
  const code = value("code");
  const state = value("state") ?? "";
  const parsed = parseState(state);

  if (!parsed) {
    res
      .status(400)
      .send(page("No pude volver", "El permiso vino sin remitente."));
    return;
  }

  const { orgId, sourceId } = parsed;
  const source = await readSource(orgId, sourceId);
  // The state is what proves this callback answers the request we made, so a
  // mismatch is where a forged one stops.
  if (!source || source.oauth?.state !== state) {
    res.status(400).send(page("No pude volver", "Ese permiso ya no vale."));
    return;
  }

  if (denied || !code) {
    res
      .status(400)
      .send(page("Quedó sin conectar", denied ?? "No llegó el permiso."));
    return;
  }

  try {
    await authorize(orgId, source, code);
    // Both were only good for this one exchange, and it just happened.
    await patchOAuth(orgId, sourceId, {
      state: undefined,
      codeVerifier: undefined,
    });
    closeSource(orgId, sourceId);

    // Now that it answers, the tool list can finally be filled in.
    const fresh = await readSource(orgId, sourceId);
    if (fresh) {
      await setSourceTools(
        orgId,
        sourceId,
        await listSourceTools(orgId, fresh),
      );
    }
    res
      .status(200)
      .send(page("Listo", "Ya podés cerrar esta ventana.", sourceId));
  } catch (error) {
    res
      .status(400)
      .send(
        page(
          "Quedó sin conectar",
          error instanceof Error ? error.message : "No pude terminar.",
          sourceId,
        ),
      );
  }
});

sourcesRouter.use((req, res, next) => {
  if (typeof req.query.orgId !== "string") {
    res.status(400).json({ error: "Falta la empresa." });
    return;
  }
  rememberOrigin(req);
  next();
});

function failed(error: unknown): string {
  return error instanceof Error ? error.message : "No pude leer las fuentes.";
}

sourcesRouter.delete("/", async (req, res) => {
  const { orgId, id } = req.query as Record<string, string>;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Falta la fuente." });
    return;
  }
  try {
    closeSource(orgId, id);
    await deleteSource(orgId, id);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: failed(error) });
  }
});

sourcesRouter.post("/", async (req, res) => {
  const orgId = req.query.orgId as string;
  try {
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
  } catch (error) {
    res.status(400).json({ error: failed(error) });
  }
});

sourcesRouter.get("/", async (req, res) => {
  try {
    res.status(200).json({
      sources: (await listSources(req.query.orgId as string)).map(toView),
    });
  } catch (error) {
    res.status(400).json({ error: failed(error) });
  }
});
