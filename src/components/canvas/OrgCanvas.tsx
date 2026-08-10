import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  ReactFlow,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import AgentNodeCard from "@/components/canvas/AgentNodeCard";
import DelegationEdge from "@/components/canvas/DelegationEdge";
import type { AgentNode, OrgEdge } from "@/lib/types";

// Module scope: recreating these per render remounts every node on each keystroke.
const nodeTypes = { agent: AgentNodeCard };
const edgeTypes = { org: DelegationEdge };

const defaultEdgeOptions = {
  type: "org",
  data: { kind: "delegates" as const },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: "#c4c1b8",
  },
};

interface OrgCanvasProps {
  nodes: AgentNode[];
  edges: OrgEdge[];
  onNodesChange: OnNodesChange<AgentNode>;
  onEdgesChange: OnEdgesChange<OrgEdge>;
  onConnect: OnConnect;
  onNodeClick: (id: string) => void;
  /** A whole org has to fit a side pane, which needs to zoom out much further. */
  compact?: boolean;
}

export default function OrgCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  compact = false,
}: OrgCanvasProps) {
  return (
    <div className="h-full w-full">
      <ReactFlow<AgentNode, OrgEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: "#16150f", strokeWidth: 1.5 }}
        deleteKeyCode={["Backspace", "Delete"]}
        colorMode="light"
        panOnScroll
        fitView
        fitViewOptions={{ padding: compact ? 0.08 : 0.24 }}
        minZoom={compact ? 0.04 : 0.2}
        maxZoom={1.8}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--color-board-dot)"
          bgColor="var(--color-board)"
        />
        {compact ? null : (
          <Controls showInteractive={false} position="bottom-left" />
        )}
      </ReactFlow>
    </div>
  );
}
