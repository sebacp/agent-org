import dagre from "@dagrejs/dagre";
import type { AgentNode, OrgEdge } from "@agent-org/shared/types";

const FALLBACK_WIDTH = 220;
const FALLBACK_HEIGHT = 108;

/**
 * Only `delegates` edges define rank, so an advisory link between two peers
 * can't distort the hierarchy. Dagre handles multi-parent and cyclic graphs,
 * so this degrades gracefully when the org stops being a strict tree.
 */
export function autoLayout(nodes: AgentNode[], edges: OrgEdge[]): AgentNode[] {
  if (nodes.length === 0) return nodes;

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "TB",
    nodesep: 44,
    ranksep: 92,
    marginx: 48,
    marginy: 48,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    graph.setNode(node.id, {
      width: node.measured?.width ?? FALLBACK_WIDTH,
      height: node.measured?.height ?? FALLBACK_HEIGHT,
    });
  }

  const known = new Set(nodes.map((n) => n.id));
  for (const edge of edges) {
    if (edge.data?.kind === "link") continue;
    if (!known.has(edge.source) || !known.has(edge.target)) continue;
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    const laid = graph.node(node.id);
    if (!laid) return node;
    return {
      ...node,
      position: {
        x: laid.x - laid.width / 2,
        y: laid.y - laid.height / 2,
      },
    };
  });
}
