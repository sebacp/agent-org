import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import type { OrgEdge } from "@agent-org/shared/types";

const STROKE_DELEGATES = "var(--color-line)";
const STROKE_LINK = "var(--color-line-soft)";
const STROKE_SELECTED = "var(--color-ink)";

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
  const { deleteElements } = useReactFlow();
  // Selecting the line and hitting a key works, but nothing says so. Pointing
  // at a line is how anyone would look for the way to cut it.
  const [pointed, setPointed] = useState(false);

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

  const cut = pointed || selected;
  const stroke = cut
    ? STROKE_SELECTED
    : isLink
      ? STROKE_LINK
      : STROKE_DELEGATES;

  return (
    <>
      <g
        onPointerEnter={() => setPointed(true)}
        onPointerLeave={() => setPointed(false)}
      >
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
      </g>

      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute flex items-center gap-1"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {data?.label ? (
            <span className="bg-canvas px-1.5 text-[10px] text-faint">
              {data.label}
            </span>
          ) : null}
          {cut ? (
            <button
              type="button"
              aria-label="Cortar la línea"
              // The label renderer lets nothing through by default, and leaving
              // the line for the button would otherwise close it mid-reach.
              className="pointer-events-auto flex size-[22px] items-center justify-center rounded-full border border-hairline bg-panel text-[13px] leading-none text-dim shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-colors hover:border-danger hover:text-danger"
              onPointerEnter={() => setPointed(true)}
              onPointerLeave={() => setPointed(false)}
              onClick={() => void deleteElements({ edges: [{ id }] })}
            >
              ×
            </button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
