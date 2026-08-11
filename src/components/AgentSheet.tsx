import { useEffect, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import { Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import SourceIcon from "@/components/ui/SourceIcon";
import { MODELS, type ModelId } from "@/lib/models";
import type { SourceView } from "@/lib/source-types";
import type {
  AgentData,
  AgentNode,
  CompanyProfile,
  DepartmentDef,
  LibraryPermission,
} from "@/lib/types";

/** Reading is everyone's, so it isn't here: these are the two that are granted. */
const LIBRARY_PERMISSIONS: {
  permission: LibraryPermission;
  label: string;
  note?: string;
}[] = [
  { permission: "write", label: "Guardar archivos" },
  { permission: "delete", label: "Borrar archivos", note: "no se deshace" },
];

interface AgentSheetProps {
  node: AgentNode;
  company: CompanyProfile;
  department: DepartmentDef | null;
  sources: SourceView[];
  removable: boolean;
  onChange: (id: string, patch: Partial<AgentData>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export default function AgentSheet({
  node,
  company,
  department,
  sources,
  removable,
  onChange,
  onRemove,
  onClose,
}: AgentSheetProps) {
  const [role, setRole] = useState(node.data.role);
  const [name, setName] = useState(node.data.name);
  const [instructions, setInstructions] = useState(node.data.instructions);
  /** Closed by default: it's the same text on every agent of the same area. */
  const [showContext, setShowContext] = useState(false);

  // Debounced so a keystroke doesn't re-render every card on the canvas behind.
  useEffect(() => {
    if (
      role === node.data.role &&
      name === node.data.name &&
      instructions === node.data.instructions
    ) {
      return;
    }
    const timer = window.setTimeout(
      () => onChange(node.id, { role, name, instructions }),
      200,
    );
    return () => window.clearTimeout(timer);
  }, [role, name, instructions, node, onChange]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const library = node.data.library ?? [];
  const toggleLibrary = (permission: LibraryPermission) => {
    onChange(node.id, {
      library: library.includes(permission)
        ? library.filter((p) => p !== permission)
        : [...library, permission],
    });
  };

  const grants = node.data.sources ?? [];
  const granted = (sourceId: string) =>
    grants.find((g) => g.sourceId === sourceId)?.tools ?? [];

  /** No tools means no access, so the grant is dropped rather than emptied. */
  const setGranted = (sourceId: string, tools: string[]) => {
    if (tools.length === 0) {
      onChange(node.id, {
        sources: grants.filter((g) => g.sourceId !== sourceId),
      });
      return;
    }
    onChange(node.id, {
      sources: grants.some((g) => g.sourceId === sourceId)
        ? grants.map((g) => (g.sourceId === sourceId ? { ...g, tools } : g))
        : [...grants, { sourceId, tools }],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-ink/15"
      />

      <aside className="relative flex h-full w-full max-w-[440px] flex-col border-l border-hairline bg-chrome">
        <header className="flex items-center gap-3 border-b border-hairline px-5 py-3.5">
          <Avatar seed={node.id} size={30} />
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">
            {role || "Agente"}
          </span>
          <Button onClick={onClose}>Cerrar</Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-6">
          <div className="flex gap-3">
            <Field label="Rol" className="flex-1">
              <TextInput
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="CMO"
              />
            </Field>
            <Field label="Modelo" className="w-[150px]">
              <Select
                value={node.data.model}
                onChange={(e) =>
                  onChange(node.id, { model: e.target.value as ModelId })
                }
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Nombre completo">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Chief Marketing Officer"
            />
          </Field>

          <Field
            label="Instrucciones"
            hint="Qué hace, cómo decide y qué no le toca. Escribile de vos."
          >
            <TextArea
              rows={12}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Sos el CMO. Definís el posicionamiento y repartís el trabajo entre tu equipo…"
            />
          </Field>

          <div>
            <p className="text-[14px] font-medium text-ink">Fuentes de datos</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-faint">
              A qué se puede conectar y qué puede hacer con eso. Lo que no
              marques, no existe para él.
            </p>

            <div className="mt-2.5 rounded-xl border border-hairline bg-raised px-3.5 py-3">
              <p className="text-[13px] text-ink">Biblioteca de la empresa</p>
              <div className="mt-2 flex flex-col gap-1.5">
                <Permission label="Leer archivos" note="siempre" on locked />
                {LIBRARY_PERMISSIONS.map((row) => (
                  <Permission
                    key={row.permission}
                    label={row.label}
                    note={row.note}
                    on={library.includes(row.permission)}
                    onToggle={() => toggleLibrary(row.permission)}
                  />
                ))}
              </div>
            </div>

            {sources.length === 0 ? (
              <p className="mt-2.5 rounded-xl border border-dashed border-hairline px-3.5 py-3 text-[13px] leading-relaxed text-faint">
                Todavía no conectaste ninguna fuente. Se conectan en la sección
                Fuentes.
              </p>
            ) : null}

            {sources.map((source) => {
              const picked = granted(source.id);
              const readable = source.tools.filter((t) => t.readOnly);

              return (
                <div
                  key={source.id}
                  className="mt-2.5 rounded-xl border border-hairline bg-raised px-3.5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <label className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={picked.length > 0}
                        onChange={(e) =>
                          setGranted(
                            source.id,
                            e.target.checked
                              ? source.tools.map((t) => t.name)
                              : [],
                          )
                        }
                      />
                      <SourceIcon label={source.label} url={source.url} />
                      <span className="truncate text-[13px] text-ink">
                        {source.label || "Sin nombre"}
                      </span>
                    </label>
                    <span className="shrink-0 text-[12px] text-faint">
                      {source.enabled
                        ? `${picked.length} de ${source.tools.length}`
                        : "apagada"}
                    </span>
                  </div>

                  {source.tools.length === 0 ? (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
                      No sé qué funciones tiene. Probá la conexión en Fuentes.
                    </p>
                  ) : picked.length > 0 ? (
                    <>
                      <div className="mt-2 flex gap-4 text-[12px]">
                        <button
                          type="button"
                          onClick={() =>
                            setGranted(
                              source.id,
                              source.tools.map((t) => t.name),
                            )
                          }
                          className="text-faint transition-colors hover:text-ink"
                        >
                          Todas
                        </button>
                        {/* Only worth offering when the server actually says
                            which of its tools write. */}
                        {readable.length > 0 &&
                        readable.length < source.tools.length ? (
                          <button
                            type="button"
                            onClick={() =>
                              setGranted(
                                source.id,
                                readable.map((t) => t.name),
                              )
                            }
                            className="text-faint transition-colors hover:text-ink"
                          >
                            Sólo lectura
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {source.tools.map((tool) => (
                          <Chip
                            key={tool.name}
                            on={picked.includes(tool.name)}
                            label={tool.name}
                            note={tool.readOnly ? undefined : "escribe"}
                            title={tool.description}
                            onClick={() =>
                              setGranted(
                                source.id,
                                picked.includes(tool.name)
                                  ? picked.filter((t) => t !== tool.name)
                                  : [...picked, tool.name],
                              )
                            }
                          />
                        ))}
                      </div>

                      {/* The label used to be the whole of it. Now it is also
                        what decides whether the corrida stops and espera. */}
                      {picked.some(
                        (name) =>
                          !source.tools.find((t) => t.name === name)?.readOnly,
                      ) ? (
                        <p className="mt-2 text-[11px] leading-relaxed text-faint">
                          Las que escriben frenan y te piden permiso antes de
                          correr, salvo que apagues el resguardo desde el gasto
                          del mes.
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowContext((open) => !open)}
              className="flex w-full items-baseline justify-between gap-3 text-left"
            >
              <span className="text-[14px] font-medium text-ink">
                Además va a saber esto
              </span>
              <span className="shrink-0 text-[13px] text-faint">
                {showContext ? "Ocultar" : "Ver"}
              </span>
            </button>
            {showContext ? (
              <>
                <p className="mt-0.5 text-[13px] leading-relaxed text-faint">
                  Lo hereda de la empresa y de su área, sin que tengas que
                  repetirlo.
                </p>
                <Inherited
                  label={company.name || "Tu empresa"}
                  text={company.purpose}
                  empty="Todavía no contaste a qué se dedica la empresa."
                />
                <Inherited
                  label={department?.label || "Su área"}
                  text={department?.mission ?? ""}
                  empty="El área todavía no tiene misión."
                />
              </>
            ) : null}
          </div>

          {removable ? (
            <Button
              variant="danger"
              className="-ml-1 self-start"
              onClick={() => onRemove(node.id)}
            >
              Quitar del equipo
            </Button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Permission({
  label,
  note,
  on,
  locked,
  onToggle,
}: {
  label: string;
  note?: string;
  on: boolean;
  /** Granted to everyone, so it is shown as a fact rather than as a choice. */
  locked?: boolean;
  onToggle?: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-2 text-[13px] ${locked ? "text-faint" : "text-dim"}`}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={locked}
        onChange={() => onToggle?.()}
      />
      {label}
      {note ? <span className="text-[12px] text-faint">{note}</span> : null}
    </label>
  );
}

function Inherited({
  label,
  text,
  empty,
}: {
  label: string;
  text: string;
  empty: string;
}) {
  return (
    <div className="mt-2.5 rounded-xl border border-hairline bg-raised px-3.5 py-3">
      <p className="text-[11px] tracking-[0.1em] text-faint uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-line text-dim">
        {text.trim() || empty}
      </p>
    </div>
  );
}
