import type { NextApiRequest, NextApiResponse } from "next";
import { closeSource, listSourceTools } from "@/server/mcp";
import { authorize, parseState, rememberOrigin } from "@/server/oauth";
import { patchOAuth, readSource, setSourceTools } from "@/server/sources";

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
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
    res.status(400).send(page("No pude volver", "El permiso vino sin remitente."));
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
    await patchOAuth(orgId, sourceId, { state: undefined, codeVerifier: undefined });
    closeSource(orgId, sourceId);

    // Now that it answers, the tool list can finally be filled in.
    const fresh = await readSource(orgId, sourceId);
    if (fresh) {
      await setSourceTools(orgId, sourceId, await listSourceTools(orgId, fresh));
    }
    res.status(200).send(page("Listo", "Ya podés cerrar esta ventana.", sourceId));
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
}
