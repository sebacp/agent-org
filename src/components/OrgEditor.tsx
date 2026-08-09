import { useRouter } from "next/router";
import AgentSheet from "@/components/AgentSheet";
import StepAreas from "@/components/wizard/StepAreas";
import StepChart from "@/components/wizard/StepChart";
import StepCompany from "@/components/wizard/StepCompany";
import StepTeam from "@/components/wizard/StepTeam";
import Stepper from "@/components/wizard/Stepper";
import { useAutosave } from "@/hooks/useAutosave";
import { useOrgGraph } from "@/hooks/useOrgGraph";
import { DepartmentsProvider } from "@/lib/department-context";

export default function OrgEditor({ orgId }: { orgId: string }) {
  const router = useRouter();
  const org = useOrgGraph(orgId);
  useAutosave(orgId, org.company, org.departments, org.nodes, org.edges);

  const openDepartment = org.openAgent
    ? (org.departments.find((d) => d.id === org.openAgent?.data.department) ??
      null)
    : null;

  return (
    <DepartmentsProvider value={org.departments}>
      <div className="flex h-screen flex-col bg-canvas">
        <Stepper
          step={org.step}
          unlocked={Boolean(org.company.name.trim())}
          onGo={org.goToStep}
          onLibrary={() => void router.push("/")}
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
              onBack={() => org.goToStep(1)}
              onNext={() => org.goToStep(3)}
            />
          ) : org.step === 3 ? (
            <StepTeam
              departments={org.departments}
              nodes={org.nodes}
              onToggleRole={org.toggleRole}
              onAddAgent={org.addAgent}
              onOpenAgent={org.setOpenAgentId}
              onBack={() => org.goToStep(2)}
              onNext={() => org.goToStep(4)}
            />
          ) : (
            <StepChart
              company={org.company}
              departments={org.departments}
              nodes={org.nodes}
              edges={org.edges}
              onNodesChange={org.onNodesChange}
              onEdgesChange={org.onEdgesChange}
              onConnect={org.onConnect}
              onOpenAgent={org.setOpenAgentId}
              onAutoLayout={org.runAutoLayout}
              onExport={org.exportOrg}
              onImport={org.importOrg}
              onRun={() => void router.push(`/org/${orgId}`)}
              onBack={() => org.goToStep(3)}
            />
          )}
        </main>

        {org.openAgent ? (
          <AgentSheet
            key={org.openAgent.id}
            node={org.openAgent}
            company={org.company}
            department={openDepartment}
            removable={org.openAgent.data.role !== "CEO"}
            onChange={org.updateAgent}
            onRemove={org.removeAgent}
            onClose={() => org.setOpenAgentId(null)}
          />
        ) : null}
      </div>
    </DepartmentsProvider>
  );
}
