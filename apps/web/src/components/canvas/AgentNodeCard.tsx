import { memo } from "react";
import { Handle, Position, useStore, type NodeProps } from "@xyflow/react";
import Avatar from "@/components/ui/Avatar";
import SourceIcon from "@/components/ui/SourceIcon";
import { useDepartments } from "@/lib/department-context";
import { modelLabel } from "@agent-org/shared/models";
import { departmentLabel, ROOT_DEPARTMENT } from "@/lib/roles";
import { useAgentStatus } from "@/lib/run-context";
import type { AgentStatus } from "@agent-org/shared/run-types";
import { useSourceCatalog } from "@/lib/source-context";
import type { AgentData, AgentNode } from "@agent-org/shared/types";

const STATUS_LABEL: Record<Exclude<AgentStatus, "idle">, string> = {
  planning: "repartiendo",
  waiting: "esperando",
  working: "trabajando",
  done: "listo",
  error: "error",
};

const STATUS_STYLE: Record<Exclude<AgentStatus, "idle">, string> = {
  planning: "bg-ink text-on-ink",
  waiting: "bg-raised text-dim",
  working: "bg-ink text-on-ink",
  done: "bg-raised text-dim",
  error: "bg-danger-soft text-danger",
};

/** More than this and the chips take over the card. */
const MAX_CHIPS = 3;

function AgentNodeCard({ id, data, selected }: NodeProps<AgentNode>) {
  const departments = useDepartments();
  const catalog = useSourceCatalog();
  const status = useAgentStatus(id);
  const busy = status === "planning" || status === "working";

  // Nobody manages the CEO, so the top of the chart has nothing to receive: an
  // arrow landing there would put somebody above the company.
  const isRoot = useStore((state) => {
    for (const node of state.nodeLookup.values()) {
      if ((node.data as AgentData).department === ROOT_DEPARTMENT) {
        return node.id === id;
      }
    }
    return false;
  });

  // A grant can outlive the source it points at, and one that no longer exists
  // is nothing the agent can reach.
  const connected = (data.sources ?? []).flatMap((grant) => {
    const source = catalog.find((s) => s.id === grant.sourceId);
    if (!source) return [];
    return [
      {
        id: grant.sourceId,
        label: source.label,
        url: source.url,
        tools: grant.tools,
      },
    ];
  });

  return (
    <div
      className={`w-[220px] rounded-lg border bg-panel px-3.5 py-3 ${
        selected || busy
          ? "border-ink"
          : "border-hairline shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
      }`}
    >
      {isRoot ? null : <Handle type="target" position={Position.Top} />}

      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] tracking-[0.12em] text-faint uppercase">
          {departmentLabel(departments, data.department)}
        </p>
        {status !== "idle" ? (
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] tracking-[0.08em] uppercase ${STATUS_STYLE[status]} ${busy ? "animate-pulse" : ""}`}
          >
            {STATUS_LABEL[status]}
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 flex items-center gap-2.5">
        <Avatar seed={id} size={34} />
        <div className="min-w-0">
          <p className="truncate text-[14px] leading-tight font-medium text-ink">
            {data.role.trim() || "Sin rol"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-faint">{data.name}</p>
        </div>
      </div>

      <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-dim">
        {data.instructions.trim() || (
          <span className="text-faint">Sin instrucciones</span>
        )}
      </p>

      <p className="mt-2.5 font-mono text-[10px] text-faint">
        {modelLabel(data.model)}
      </p>

      {connected.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {connected.slice(0, MAX_CHIPS).map((source) => (
            <span
              key={source.id}
              title={source.tools.join(", ")}
              className="flex max-w-full items-center gap-1 rounded-md bg-raised px-1.5 py-0.5 text-[10px] text-dim"
            >
              <SourceIcon label={source.label} url={source.url} size={12} />
              <span className="truncate">{source.label || "Sin nombre"}</span>
              <span className="text-faint">{source.tools.length}</span>
            </span>
          ))}
          {connected.length > MAX_CHIPS ? (
            <span className="rounded-md bg-raised px-1.5 py-0.5 text-[10px] text-faint">
              +{connected.length - MAX_CHIPS}
            </span>
          ) : null}
        </div>
      ) : null}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(AgentNodeCard);
