import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { MODELS, type ModelId } from "@/lib/models";
import type {
  AgentData,
  AgentNode,
  CompanyProfile,
  DepartmentDef,
} from "@/lib/types";

interface AgentSheetProps {
  node: AgentNode;
  company: CompanyProfile;
  department: DepartmentDef | null;
  removable: boolean;
  onChange: (id: string, patch: Partial<AgentData>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export default function AgentSheet({
  node,
  company,
  department,
  removable,
  onChange,
  onRemove,
  onClose,
}: AgentSheetProps) {
  const [role, setRole] = useState(node.data.role);
  const [name, setName] = useState(node.data.name);
  const [instructions, setInstructions] = useState(node.data.instructions);

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
            <p className="text-[14px] font-medium text-ink">
              Además va a saber esto
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-faint">
              Lo hereda de la empresa y de su área, sin que tengas que repetirlo.
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
