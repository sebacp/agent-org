import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import type { OrgEdge } from "@/lib/types";

const STROKE_DELEGATES = "#c4c1b8";
const STROKE_LINK = "#d3d0c7";
const STROKE_SELECTED = "#16150f";

export default function DelegationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<OrgEdge>) {
  const isLink = data?.kind === "link";

  // Links usually join peers on the same rank, where orthogonal routing draws a
  // hard rectangle that reads like a selection box. A curve stays legible.
  const geometry = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  };
  const [path, labelX, labelY] = isLink
    ? getBezierPath({ ...geometry, curvature: 0.55 })
    : getSmoothStepPath({ ...geometry, borderRadius: 18 });

  const stroke = selected
    ? STROKE_SELECTED
    : isLink
      ? STROKE_LINK
      : STROKE_DELEGATES;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={isLink ? undefined : markerEnd}
        style={{
          stroke,
          strokeWidth: isLink ? 1 : 1.5,
          strokeDasharray: isLink ? "4 5" : undefined,
        }}
      />
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute bg-canvas px-1.5 text-[10px] text-faint"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
