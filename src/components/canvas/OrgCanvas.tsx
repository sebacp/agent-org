import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type OnConnect,
  type OnConnectEnd,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
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
    color: "var(--color-line)",
  },
};

interface OrgCanvasProps {
  nodes: AgentNode[];
  edges: OrgEdge[];
  onNodesChange: OnNodesChange<AgentNode>;
  onEdgesChange: OnEdgesChange<OrgEdge>;
  onConnect: OnConnect;
  onNodeClick: (id: string) => void;
  /** Dropping a line on bare canvas: staffing the chart without leaving it. */
  onCreateReport?: (managerId: string, position: XYPosition) => void;
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
  onCreateReport,
  compact = false,
}: OrgCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();

  // Letting go over nothing is the only case worth reading as an intention:
  // over a handle React Flow already made the edge, and over another card the
  // gesture was aimed at somebody who is on the chart.
  const onConnectEnd: OnConnectEnd = (event, state) => {
    if (!onCreateReport || state.isValid || state.toNode) return;
    if (state.fromHandle?.type !== "source" || !state.fromNode) return;
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    if (!point) return;
    onCreateReport(
      state.fromNode.id,
      screenToFlowPosition({ x: point.clientX, y: point.clientY }),
    );
  };

  return (
    <div className="h-full w-full">
      <ReactFlow<AgentNode, OrgEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: "var(--color-ink)", strokeWidth: 1.5 }}
        deleteKeyCode={["Backspace", "Delete"]}
        colorMode="dark"
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
