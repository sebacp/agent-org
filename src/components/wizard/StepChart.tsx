import { useRef, useState } from "react";
import type {
  OnEdgesChange,
  OnNodesChange,
  OnConnect,
  XYPosition,
} from "@xyflow/react";
import OrgCanvas from "@/components/canvas/OrgCanvas";
import Button from "@/components/ui/Button";
import type { AgentNode, DepartmentDef, OrgEdge } from "@/lib/types";

interface StepChartProps {
  departments: DepartmentDef[];
  nodes: AgentNode[];
  edges: OrgEdge[];
  onNodesChange: OnNodesChange<AgentNode>;
  onEdgesChange: OnEdgesChange<OrgEdge>;
  onConnect: OnConnect;
  onOpenAgent: (id: string) => void;
  onCreateReport: (managerId: string, position: XYPosition) => void;
  onAutoLayout: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
}

export default function StepChart({
  departments,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onOpenAgent,
  onCreateReport,
  onAutoLayout,
  onExport,
  onImport,
}: StepChartProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <OrgCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onOpenAgent}
          onCreateReport={onCreateReport}
        />
      </div>

      <footer className="border-t border-hairline bg-chrome">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <Button onClick={onAutoLayout}>Ordenar</Button>
          <Button onClick={onExport}>Exportar</Button>
          <Button onClick={() => fileRef.current?.click()}>Importar</Button>

          {error ? (
            <span className="text-[13px] text-danger">{error}</span>
          ) : null}

          {/* The whole chart is built with the handles, and nothing on the
              canvas says what they do. */}
          <span className="ml-auto hidden text-[12px] text-faint lg:block">
            {nodes.length} {nodes.length === 1 ? "agente" : "agentes"} en{" "}
            {departments.length} {departments.length === 1 ? "área" : "áreas"} ·
            tocá a uno para ajustarlo, arrastrá de un punto a otro para
            conectarlos, o soltá en el vacío para sumar a alguien abajo
          </span>
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
