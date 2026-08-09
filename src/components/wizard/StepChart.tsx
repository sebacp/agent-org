import { useRef, useState } from "react";
import type { OnEdgesChange, OnNodesChange, OnConnect } from "@xyflow/react";
import OrgCanvas from "@/components/canvas/OrgCanvas";
import Button from "@/components/ui/Button";
import type { AgentNode, CompanyProfile, DepartmentDef, OrgEdge } from "@/lib/types";

interface StepChartProps {
  company: CompanyProfile;
  departments: DepartmentDef[];
  nodes: AgentNode[];
  edges: OrgEdge[];
  onNodesChange: OnNodesChange<AgentNode>;
  onEdgesChange: OnEdgesChange<OrgEdge>;
  onConnect: OnConnect;
  onOpenAgent: (id: string) => void;
  onAutoLayout: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  onRun: () => void;
  onBack: () => void;
}

export default function StepChart({
  company,
  departments,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onOpenAgent,
  onAutoLayout,
  onExport,
  onImport,
  onRun,
  onBack,
}: StepChartProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto w-full max-w-[640px] px-6 pt-11 pb-7 text-center">
        <h1 className="text-[27px] leading-tight font-semibold tracking-tight text-ink">
          Así queda {company.name.trim() || "tu empresa"}
        </h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-dim">
          {nodes.length} {nodes.length === 1 ? "agente" : "agentes"} en{" "}
          {departments.length} {departments.length === 1 ? "área" : "áreas"}.
          Tocá a cualquiera para ajustarlo, o arrastrá desde el punto de abajo de
          uno hasta el de arriba de otro para conectarlos a mano.
        </p>
      </div>

      <div className="min-h-0 flex-1 border-t border-hairline">
        <OrgCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onOpenAgent}
        />
      </div>

      <footer className="border-t border-hairline bg-chrome">
        <div className="mx-auto flex w-full max-w-[860px] flex-wrap items-center gap-2 px-6 py-4">
          <Button size="lg" onClick={onBack}>
            Atrás
          </Button>

          <span className="mx-1 h-5 w-px bg-hairline" />

          <Button onClick={onAutoLayout}>Ordenar</Button>
          <Button onClick={onExport}>Exportar</Button>
          <Button onClick={() => fileRef.current?.click()}>Importar</Button>

          {error ? (
            <span className="text-[13px] text-red-700">{error}</span>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            className="ml-auto"
            onClick={onRun}
          >
            Poner a trabajar
          </Button>
        </div>
      </footer>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setError(null);
          try {
            await onImport(file);
          } catch {
            setError("Archivo inválido");
          }
        }}
      />
    </div>
  );
}
