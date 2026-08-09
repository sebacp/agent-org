import { useState } from "react";
import { useDepartments } from "@/lib/department-context";
import type { SourceProbe, SourceView } from "@/lib/source-types";

type Draft = Partial<SourceView> & { token?: string };

const EMPTY: Draft = {
  label: "",
  transport: "http",
  url: "",
  token: "",
  command: "",
  departments: [],
  readOnly: true,
  enabled: true,
};

const INPUT =
  "w-full rounded-lg border border-hairline bg-panel px-2.5 py-1.5 text-[12px] text-ink outline-none placeholder:text-faint focus:border-faint";

function Chip({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
        on
          ? "border-ink/30 bg-raised text-ink"
          : "border-hairline text-faint hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

interface SourceBoardProps {
  sources: SourceView[];
  probes: Record<string, SourceProbe>;
  onSave: (input: Draft) => Promise<SourceProbe>;
  onRemove: (id: string) => void;
}

export default function SourceBoard({
  sources,
  probes,
  onSave,
  onRemove,
}: SourceBoardProps) {
  const departments = useDepartments();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const patch = (values: Draft) =>
    setDraft((current) => ({ ...(current ?? EMPTY), ...values }));

  const toggleArea = (id: string) =>
    setDraft((current) => {
      const areas = current?.departments ?? [];
      return {
        ...(current ?? EMPTY),
        departments: areas.includes(id)
          ? areas.filter((a) => a !== id)
          : [...areas, id],
      };
    });

  const run = async (input: Draft, id: string) => {
    setBusy(id);
    setFailure(null);
    try {
      const probe = await onSave(input);
      if (probe.error) setFailure(probe.error);
      else setDraft(null);
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : "No pude guardarla.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-3">
      {sources.map((source) => {
        const probe = probes[source.id];
        const areas = source.departments.length
          ? source.departments
              .map((id) => departments.find((d) => d.id === id)?.label ?? id)
              .join(", ")
          : "toda la empresa";

        return (
          <div key={source.id} className="group relative px-3 py-3">
            <p className="pr-5 text-[13px] leading-snug text-ink">
              {source.label || "Sin nombre"}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-faint">
              {source.transport === "http" ? source.url : source.command}
            </p>
            <p className="mt-0.5 text-[11px] text-faint">
              {areas}
              {source.enabled ? "" : " · apagada"}
              {probe
                ? probe.error
                  ? " · no conecta"
                  : ` · ${probe.tools.length} herramienta${probe.tools.length === 1 ? "" : "s"}`
                : ""}
            </p>

            {probe?.error ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-red-700">
                {probe.error}
              </p>
            ) : null}

            <button
              type="button"
              aria-label="Borrar fuente"
              onClick={() => onRemove(source.id)}
              className="absolute top-2.5 right-0 text-[13px] text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-700 focus:opacity-100"
            >
              ×
            </button>

            {draft?.id === source.id ? null : (
              <div className="mt-2 flex gap-3 text-[12px]">
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
                  {busy === source.id ? "Probando…" : "Probar"}
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
              </div>
            )}
          </div>
        );
      })}

      {draft ? (
        <div className="mt-1 rounded-xl border border-hairline bg-panel p-3">
          <input
            autoFocus
            value={draft.label ?? ""}
            onChange={(e) => patch({ label: e.target.value })}
            placeholder="Nombre, por ejemplo Notion o Postgres"
            className={INPUT}
          />

          <div className="mt-2 flex gap-1.5">
            <Chip
              on={draft.transport !== "stdio"}
              label="URL"
              onClick={() => patch({ transport: "http" })}
            />
            <Chip
              on={draft.transport === "stdio"}
              label="Comando"
              onClick={() => patch({ transport: "stdio" })}
            />
          </div>

          {draft.transport === "stdio" ? (
            <input
              value={draft.command ?? ""}
              onChange={(e) => patch({ command: e.target.value })}
              placeholder="npx -y @modelcontextprotocol/server-filesystem /ruta"
              className={`${INPUT} mt-2 font-mono`}
            />
          ) : (
            <>
              <input
                value={draft.url ?? ""}
                onChange={(e) => patch({ url: e.target.value })}
                placeholder="https://servidor/mcp"
                className={`${INPUT} mt-2`}
              />
              <input
                type="password"
                value={draft.token ?? ""}
                onChange={(e) => patch({ token: e.target.value })}
                placeholder={
                  draft.hasToken ? "Token guardado · escribí para cambiarlo" : "Token, si hace falta"
                }
                className={`${INPUT} mt-2`}
              />
            </>
          )}

          {departments.length > 0 ? (
            <div className="mt-2.5">
              <p className="text-[11px] text-faint">
                Áreas que la pueden usar. Sin marcar, la usa toda la empresa.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {departments.map((department) => (
                  <Chip
                    key={department.id}
                    on={(draft.departments ?? []).includes(department.id)}
                    label={department.label}
                    onClick={() => toggleArea(department.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <label className="mt-2.5 flex items-center gap-2 text-[11px] text-dim">
            <input
              type="checkbox"
              checked={draft.readOnly ?? true}
              onChange={(e) => patch({ readOnly: e.target.checked })}
            />
            Descartar las herramientas que el servidor declara de escritura
          </label>

          {failure ? (
            <p className="mt-2 text-[11px] leading-relaxed text-red-700">
              {failure}
            </p>
          ) : null}

          <div className="mt-2.5 flex gap-3 text-[12px]">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run(draft, draft.id ?? "nueva")}
              className="text-ink transition-colors hover:text-dim disabled:opacity-50"
            >
              {busy ? "Conectando…" : "Guardar y probar"}
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
          className="mt-1 px-3 py-2 text-[12px] text-faint transition-colors hover:text-ink"
        >
          + Conectar una fuente
        </button>
      )}

      {sources.length === 0 && !draft ? (
        <p className="px-3 pb-6 text-[12px] leading-relaxed text-faint">
          Un servidor MCP le da a los agentes datos de verdad: tu Notion, una
          base, un CRM. Cada área ve sólo las fuentes que le asignes.
        </p>
      ) : null}
    </div>
  );
}
