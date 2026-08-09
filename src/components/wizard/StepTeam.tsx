import Button from "@/components/ui/Button";
import PickCard, { Tag } from "@/components/ui/PickCard";
import StepShell from "@/components/wizard/StepShell";
import { modelLabel } from "@/lib/models";
import { CUSTOM_PRESET, ROLE_PRESETS, type RolePreset } from "@/lib/roles";
import type { AgentNode, DepartmentDef } from "@/lib/types";

interface StepTeamProps {
  departments: DepartmentDef[];
  nodes: AgentNode[];
  onToggleRole: (preset: RolePreset, department: string) => void;
  onAddAgent: (preset: RolePreset, department: string) => string;
  onOpenAgent: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function StepTeam({
  departments,
  nodes,
  onToggleRole,
  onAddAgent,
  onOpenAgent,
  onBack,
  onNext,
}: StepTeamProps) {
  return (
    <StepShell
      title="¿Quién trabaja en cada área?"
      subtitle="Tocá un rol para sumarlo. El primero de cada área queda a cargo y le reporta al CEO; los que agregues después le reportan a él."
      onBack={onBack}
      onNext={onNext}
      nextLabel="Ver el organigrama"
      footerNote={`${nodes.length} ${nodes.length === 1 ? "agente" : "agentes"}`}
    >
      <div className="flex flex-col gap-9">
        {departments.map((department) => {
          const presets = ROLE_PRESETS.filter(
            (p) => p.department === department.id,
          ).sort((a, b) => (a.seniority === b.seniority ? 0 : a.seniority === "lead" ? -1 : 1));
          const presetRoles = new Set(presets.map((p) => p.role));
          const extras = nodes.filter(
            (n) =>
              n.data.department === department.id && !presetRoles.has(n.data.role),
          );

          return (
            <section key={department.id}>
              <h2 className="mb-3 text-[13px] tracking-[0.08em] text-faint uppercase">
                {department.label || "Área sin nombre"}
              </h2>

              <div className="flex flex-col gap-2.5">
                {presets.map((preset) => {
                  const node = nodes.find(
                    (n) =>
                      n.data.role === preset.role &&
                      n.data.department === department.id,
                  );
                  const isCeo = preset.role === "CEO";

                  return (
                    <div key={preset.role}>
                      <PickCard
                        active={Boolean(node)}
                        locked={isCeo}
                        title={preset.role}
                        subtitle={preset.name}
                        badge={
                          isCeo ? (
                            <Tag>siempre</Tag>
                          ) : preset.seniority === "lead" ? (
                            <Tag>a cargo del área</Tag>
                          ) : undefined
                        }
                        onClick={() => onToggleRole(preset, department.id)}
                      />
                      {node ? (
                        <EditLink node={node} onOpen={onOpenAgent} />
                      ) : null}
                    </div>
                  );
                })}

                {extras.map((node) => (
                  <div key={node.id}>
                    <PickCard
                      active
                      title={node.data.role || "Sin rol"}
                      subtitle={node.data.name}
                      onClick={() => onOpenAgent(node.id)}
                    />
                    <EditLink node={node} onOpen={onOpenAgent} />
                  </div>
                ))}

                <Button
                  className="-ml-1 self-start"
                  onClick={() =>
                    onOpenAgent(onAddAgent(CUSTOM_PRESET, department.id))
                  }
                >
                  + Agente a medida
                </Button>
              </div>
            </section>
          );
        })}
      </div>
    </StepShell>
  );
}

function EditLink({
  node,
  onOpen,
}: {
  node: AgentNode;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(node.id)}
      className="mt-1.5 ml-8 text-[13px] text-faint underline underline-offset-4 hover:text-ink"
    >
      Instrucciones · {modelLabel(node.data.model)}
    </button>
  );
}
