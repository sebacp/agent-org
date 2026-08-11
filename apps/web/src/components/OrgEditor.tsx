import { useRouter } from "next/router";
import AgentSheet from "@/components/AgentSheet";
import EditorBar from "@/components/wizard/EditorBar";
import StepAreas from "@/components/wizard/StepAreas";
import StepChart from "@/components/wizard/StepChart";
import StepCompany from "@/components/wizard/StepCompany";
import StepSources from "@/components/wizard/StepSources";
import StepTeam from "@/components/wizard/StepTeam";
import { useOrgGraph } from "@/hooks/useOrgGraph";
import { useOrgSave } from "@/hooks/useOrgSave";
import { useSources } from "@/hooks/useSources";
import { DepartmentsProvider } from "@/lib/department-context";
import { SourcesProvider } from "@/lib/source-context";

export default function OrgEditor({ orgId }: { orgId: string }) {
  const router = useRouter();
  const org = useOrgGraph(orgId);
  const sources = useSources(orgId);
  const { dirty, save } = useOrgSave(
    orgId,
    org.company,
    org.departments,
    org.nodes,
    org.edges,
  );

  // Leaving is the one way out that isn't the button, so it has to ask.
  const leave = () => {
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Salir igual?")) {
      return;
    }
    void router.push("/");
  };

  const openDepartment = org.openAgent
    ? (org.departments.find((d) => d.id === org.openAgent?.data.department) ??
      null)
    : null;

  return (
    <DepartmentsProvider value={org.departments}>
      <SourcesProvider value={sources.sources}>
        <div className="flex h-screen flex-col bg-canvas">
          <EditorBar
            company={org.company.name}
            step={org.step}
            unlocked={Boolean(org.company.name.trim())}
            dirty={dirty}
            onGo={org.goToStep}
            onLibrary={leave}
            onSave={save}
          />

          <main className="min-h-0 flex-1">
            {org.step === 1 ? (
              <StepCompany
                company={org.company}
                onChange={org.updateCompany}
                onNext={() => org.goToStep(2)}
                onLoadExample={org.loadExample}
              />
            ) : org.step === 2 ? (
              <StepAreas
                departments={org.departments}
                onToggle={org.toggleDepartment}
                onAdd={org.addDepartment}
                onChange={org.updateDepartment}
                onNext={() => org.goToStep(3)}
              />
            ) : org.step === 3 ? (
              <StepTeam
                departments={org.departments}
                nodes={org.nodes}
                onToggleRole={org.toggleRole}
                onAddAgent={org.addAgent}
                onOpenAgent={org.setOpenAgentId}
                onNext={() => org.goToStep(4)}
              />
            ) : org.step === 4 ? (
              <StepSources
                sources={sources.sources}
                probes={sources.probes}
                onSave={sources.save}
                onRemove={(id) => void sources.remove(id)}
                onNext={() => org.goToStep(5)}
              />
            ) : (
              <StepChart
                departments={org.departments}
                nodes={org.nodes}
                edges={org.edges}
                onNodesChange={org.onNodesChange}
                onEdgesChange={org.onEdgesChange}
                onConnect={org.onConnect}
                onOpenAgent={org.setOpenAgentId}
                onCreateReport={(managerId, position) =>
                  org.setOpenAgentId(org.addReport(managerId, position))
                }
                onAutoLayout={org.runAutoLayout}
                onExport={org.exportOrg}
                onImport={org.importOrg}
              />
            )}
          </main>

          {org.openAgent ? (
            <AgentSheet
              key={org.openAgent.id}
              node={org.openAgent}
              company={org.company}
              department={openDepartment}
              sources={sources.sources}
              removable={org.openAgent.data.role !== "CEO"}
              onChange={org.updateAgent}
              onRemove={org.removeAgent}
              onClose={() => org.setOpenAgentId(null)}
            />
          ) : null}
        </div>
      </SourcesProvider>
    </DepartmentsProvider>
  );
}
