import { useState } from "react";
import Button from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/Field";
import PickCard, { Tag } from "@/components/ui/PickCard";
import StepShell from "@/components/wizard/StepShell";
import {
  DEPARTMENT_CATALOG,
  ROOT_DEPARTMENT,
  missionBlurb,
} from "@/lib/roles";
import type { DepartmentDef } from "@/lib/types";

interface StepAreasProps {
  departments: DepartmentDef[];
  onToggle: (id: string) => void;
  onAdd: () => string;
  onChange: (id: string, patch: Partial<Omit<DepartmentDef, "id">>) => void;
  onNext: () => void;
}

export default function StepAreas({
  departments,
  onToggle,
  onAdd,
  onChange,
  onNext,
}: StepAreasProps) {
  const [openMission, setOpenMission] = useState<string | null>(null);

  const active = (id: string) => departments.some((d) => d.id === id);
  const catalogIds = new Set(DEPARTMENT_CATALOG.map((d) => d.id));
  const custom = departments.filter((d) => !catalogIds.has(d.id));

  return (
    <StepShell
      title="¿Qué áreas tiene?"
      subtitle="Elegí las que existan de verdad. Cada área le da a su gente una misión en común, y siempre podés sumar más después."
      onNext={onNext}
      footerNote={`${departments.length} ${departments.length === 1 ? "área" : "áreas"}`}
    >
      <div className="flex flex-col gap-2.5">
        {DEPARTMENT_CATALOG.map((item) => {
          const isRoot = item.id === ROOT_DEPARTMENT;
          const isActive = active(item.id);
          const mission =
            departments.find((d) => d.id === item.id)?.mission ?? item.mission;

          return (
            <div key={item.id}>
              <PickCard
                active={isActive}
                locked={isRoot}
                title={item.label}
                subtitle={missionBlurb(item.mission)}
                badge={isRoot ? <Tag>siempre</Tag> : undefined}
                onClick={() => onToggle(item.id)}
              />

              {isActive ? (
                <div className="pt-1.5 pl-8">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMission((c) => (c === item.id ? null : item.id))
                    }
                    className="text-[13px] text-faint underline underline-offset-4 hover:text-ink"
                  >
                    {openMission === item.id
                      ? "Listo"
                      : "Ajustar la misión del área"}
                  </button>

                  {openMission === item.id ? (
                    <TextArea
                      rows={6}
                      className="mt-2"
                      value={mission}
                      onChange={(e) =>
                        onChange(item.id, { mission: e.target.value })
                      }
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}

        {custom.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-hairline bg-panel p-4"
          >
            <TextInput
              autoFocus={!item.label}
              value={item.label}
              onChange={(e) => onChange(item.id, { label: e.target.value })}
              placeholder="Nombre del área"
            />
            <TextArea
              rows={4}
              className="mt-2"
              value={item.mission}
              onChange={(e) => onChange(item.id, { mission: e.target.value })}
              placeholder="¿Qué tiene que lograr esta área y con qué criterio decide?"
            />
            <Button
              variant="danger"
              className="mt-2 -ml-1"
              onClick={() => onToggle(item.id)}
            >
              Quitar área
            </Button>
          </div>
        ))}

        <Button
          size="lg"
          className="mt-1 self-start"
          onClick={() => {
            const id = onAdd();
            setOpenMission(id);
          }}
        >
          + Crear otra área
        </Button>
      </div>
    </StepShell>
  );
}
