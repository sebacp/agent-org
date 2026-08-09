import { useRef, useState } from "react";
import type { OnEdgesChange, OnNodesChange, OnConnect } from "@xyflow/react";
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
        />
      </div>

      <footer className="border-t border-hairline bg-chrome">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <Button onClick={onAutoLayout}>Ordenar</Button>
          <Button onClick={onExport}>Exportar</Button>
          <Button onClick={() => fileRef.current?.click()}>Importar</Button>

          {error ? (
            <span className="text-[13px] text-red-700">{error}</span>
          ) : null}

          {/* Dragging one handle onto another is the only way to build a link
              by hand, and nothing on the canvas says so. */}
          <span className="ml-auto hidden text-[12px] text-faint lg:block">
            {nodes.length} {nodes.length === 1 ? "agente" : "agentes"} en{" "}
            {departments.length} {departments.length === 1 ? "área" : "áreas"} ·
            tocá a uno para ajustarlo, o arrastrá de un punto al otro para
            conectarlos
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
