import { useState } from "react";
import Chip from "@/components/ui/Chip";
import { Field, TextInput } from "@/components/ui/Field";
import SourceIcon from "@/components/ui/SourceIcon";
import StepShell from "@/components/wizard/StepShell";
import type { SourceDraft, SourceProbe, SourceView } from "@/lib/source-types";

/** A server with a hundred tools would bury the card, so the rest is counted. */
const TOOLS_SHOWN = 10;

const POPUP = "width=520,height=760";

const EMPTY: SourceDraft = {
  label: "",
  transport: "http",
  url: "",
  auth: "none",
  token: "",
  command: "",
  enabled: true,
};

const AUTH_LABELS = [
  ["none", "Sin credencial"],
  ["token", "Token"],
  ["oauth", "OAuth"],
] as const;

interface StepSourcesProps {
  sources: SourceView[];
  probes: Record<string, SourceProbe>;
  onSave: (input: SourceDraft) => Promise<SourceProbe>;
  onRemove: (id: string) => void;
  onNext: () => void;
}

export default function StepSources({
  sources,
  probes,
  onSave,
  onRemove,
  onNext,
}: StepSourcesProps) {
  const [draft, setDraft] = useState<SourceDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Kept only when the browser refused to open it, so it can be offered as a link. */
  const [blocked, setBlocked] = useState<string | null>(null);

  const patch = (values: SourceDraft) =>
    setDraft((current) => ({ ...(current ?? EMPTY), ...values }));

  const run = async (input: SourceDraft, id: string) => {
    setBusy(id);
    setFailure(null);
    setBlocked(null);
    try {
      const probe = await onSave(input);
      if (probe.error) {
        setFailure(probe.error);
        return;
      }
      setDraft(null);
      // The round-trip may outlast the click that paid for it, and a popup
      // opened too late gets swallowed instead of shown.
      if (probe.authUrl && !window.open(probe.authUrl, "_blank", POPUP)) {
        setBlocked(probe.authUrl);
      }
    } catch (caught) {
      setFailure(
        caught instanceof Error ? caught.message : "No pude guardarla.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <StepShell
      title="Las fuentes"
      subtitle="Un servidor MCP le da a tus agentes datos de verdad: tu Notion, una base, un CRM. Acá las conectás; a quién se las das lo elegís después, agente por agente."
      onNext={onNext}
      footerNote={
        sources.length > 0
          ? "Abrí un agente en el organigrama para darle acceso."
          : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {sources.map((source) => {
          const probe = probes[source.id];
          const shown = source.tools.slice(0, TOOLS_SHOWN);
          const hidden = source.tools.length - shown.length;

          return (
            <div
              key={source.id}
              className="rounded-xl border border-hairline bg-panel px-4 py-3.5"
            >
              <div className="flex items-start gap-3">
                <SourceIcon label={source.label} url={source.url} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">
                    {source.label || "Sin nombre"}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-faint">
                    {source.transport === "http" ? source.url : source.command}
                  </p>
                </div>
                <span className="shrink-0 text-[13px] text-faint">
                  {!source.enabled
                    ? "apagada"
                    : probe?.error
                      ? "no conecta"
                      : source.auth === "oauth" && !source.connected
                        ? "falta entrar"
                        : `${source.tools.length} ${source.tools.length === 1 ? "función" : "funciones"}`}
                </span>
              </div>

              {probe?.error ? (
                <p className="mt-2 text-[13px] leading-relaxed text-danger">
                  {probe.error}
                </p>
              ) : null}

              {shown.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {shown.map((tool) => (
                    <span
                      key={tool.name}
                      title={tool.description}
                      className="rounded-md border border-hairline px-2 py-1 font-mono text-[12px] text-dim"
                    >
                      {tool.name}
                      {tool.readOnly ? null : (
                        <span className="ml-1.5 font-sans text-faint">
                          escribe
                        </span>
                      )}
                    </span>
                  ))}
                  {hidden > 0 ? (
                    <span className="px-1 py-1 text-[12px] text-faint">
                      y {hidden} más
                    </span>
                  ) : null}
                </div>
              ) : null}

              {draft?.id === source.id ? null : (
                <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
                  <button
                    type="button"
                    onClick={() => setDraft({ ...source, token: "" })}
                    className="text-faint transition-colors hover:text-ink"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run({ id: source.id }, source.id)}
                    className="text-faint transition-colors hover:text-ink disabled:opacity-50"
                  >
                    {busy === source.id
                      ? "Probando…"
                      : source.auth === "oauth" && !source.connected
                        ? "Entrar"
                        : "Probar"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        { id: source.id, enabled: !source.enabled },
                        source.id,
                      )
                    }
                    className="text-faint transition-colors hover:text-ink"
                  >
                    {source.enabled ? "Apagar" : "Encender"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(source.id)}
                    className="text-faint transition-colors hover:text-danger"
                  >
                    Borrar
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {draft ? (
          <div className="rounded-xl border border-hairline bg-panel px-4 py-4">
            <Field label="¿Cómo la llamás?">
              <TextInput
                autoFocus
                value={draft.label ?? ""}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="Notion"
              />
            </Field>

            <div className="mt-4 flex gap-1.5">
              <Chip
                on={draft.transport !== "stdio"}
                label="Por URL"
                onClick={() => patch({ transport: "http" })}
              />
              <Chip
                on={draft.transport === "stdio"}
                label="Por comando"
                onClick={() => patch({ transport: "stdio" })}
              />
            </div>

            {draft.transport === "stdio" ? (
              <Field label="Comando" className="mt-4">
                <TextInput
                  value={draft.command ?? ""}
                  onChange={(e) => patch({ command: e.target.value })}
                  placeholder="npx -y @modelcontextprotocol/server-filesystem /ruta"
                  className="font-mono text-[13px]"
                />
              </Field>
            ) : (
              <>
                <Field label="Dirección" className="mt-4">
                  <TextInput
                    value={draft.url ?? ""}
                    onChange={(e) => patch({ url: e.target.value })}
                    placeholder="https://mcp.notion.com/mcp"
                  />
                </Field>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {AUTH_LABELS.map(([id, label]) => (
                    <Chip
                      key={id}
                      on={(draft.auth ?? "none") === id}
                      label={label}
                      onClick={() => patch({ auth: id })}
                    />
                  ))}
                </div>

                {draft.auth === "token" ? (
                  <Field
                    label="Token"
                    className="mt-4"
                    hint="Queda en el servidor. El navegador nunca lo vuelve a ver."
                  >
                    <TextInput
                      type="password"
                      value={draft.token ?? ""}
                      onChange={(e) => patch({ token: e.target.value })}
                      placeholder={
                        draft.hasToken
                          ? "Guardado · escribí para cambiarlo"
                          : "Pegá el token del servicio"
                      }
                    />
                  </Field>
                ) : null}

                {draft.auth === "oauth" ? (
                  <>
                    <p className="mt-3 text-[13px] leading-relaxed text-dim">
                      Al guardar se abre la ventana del servicio para que entres
                      con tu cuenta. Nada más que completar.
                    </p>
                    <Field
                      label="Client ID"
                      className="mt-4"
                      hint="Sólo hace falta donde el servicio no nos deja registrarnos solos: GitHub, Slack y HubSpot."
                    >
                      <TextInput
                        value={draft.clientId ?? ""}
                        onChange={(e) => patch({ clientId: e.target.value })}
                        placeholder="Opcional"
                      />
                    </Field>
                    {draft.clientId ? (
                      <Field label="Client secret" className="mt-4">
                        <TextInput
                          type="password"
                          value={draft.clientSecret ?? ""}
                          onChange={(e) =>
                            patch({ clientSecret: e.target.value })
                          }
                          placeholder="Si el servicio lo pide"
                        />
                      </Field>
                    ) : null}
                  </>
                ) : null}
              </>
            )}

            {failure ? (
              <p className="mt-3 text-[13px] leading-relaxed text-danger">
                {failure}
              </p>
            ) : null}

            <div className="mt-4 flex gap-4 text-[13px]">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run(draft, draft.id ?? "nueva")}
                className="text-ink underline underline-offset-4 transition-colors hover:text-dim disabled:opacity-50"
              >
                {busy
                  ? "Conectando…"
                  : draft.auth === "oauth"
                    ? "Guardar y entrar"
                    : "Guardar y probar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setFailure(null);
                }}
                className="text-faint transition-colors hover:text-ink"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDraft(EMPTY)}
            className="rounded-xl border border-dashed border-hairline px-4 py-4 text-left text-[14px] text-faint transition-colors hover:border-faint hover:text-ink"
          >
            + Conectar una fuente
          </button>
        )}

        {blocked ? (
          <a
            href={blocked}
            target="_blank"
            rel="noreferrer"
            onClick={() => setBlocked(null)}
            className="rounded-xl border border-hairline bg-panel px-4 py-3.5 text-[13px] leading-relaxed text-ink underline underline-offset-4"
          >
            El navegador bloqueó la ventana. Abrila vos para entrar al servicio.
          </a>
        ) : null}
      </div>
    </StepShell>
  );
}
