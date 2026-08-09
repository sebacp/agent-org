import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useDepartments } from "@/lib/department-context";
import { modelLabel } from "@/lib/models";
import { departmentLabel } from "@/lib/roles";
import { useAgentStatus } from "@/lib/run-context";
import type { AgentStatus } from "@/lib/run-types";
import type { AgentNode } from "@/lib/types";

const STATUS_LABEL: Record<Exclude<AgentStatus, "idle">, string> = {
  planning: "repartiendo",
  waiting: "esperando",
  working: "trabajando",
  done: "listo",
  error: "error",
};

const STATUS_STYLE: Record<Exclude<AgentStatus, "idle">, string> = {
  planning: "bg-ink text-white",
  waiting: "bg-raised text-dim",
  working: "bg-ink text-white",
  done: "bg-raised text-dim",
  error: "bg-red-50 text-red-700",
};

function AgentNodeCard({ id, data, selected }: NodeProps<AgentNode>) {
  const departments = useDepartments();
  const status = useAgentStatus(id);
  const busy = status === "planning" || status === "working";

  return (
    <div
      className={`w-[220px] rounded-lg border bg-panel px-3.5 py-3 ${
        selected || busy
          ? "border-ink shadow-[0_0_0_1px_#16150f]"
          : "border-hairline shadow-[0_1px_2px_rgba(22,21,15,0.05)]"
      }`}
    >
      <Handle type="target" position={Position.Top} />

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

      <p className="mt-1.5 text-[14px] leading-tight font-medium text-ink">
        {data.role.trim() || "Sin rol"}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-faint">{data.name}</p>

      <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-dim">
        {data.instructions.trim() || (
          <span className="text-faint">Sin instrucciones</span>
        )}
      </p>

      <p className="mt-2.5 font-mono text-[10px] text-faint">
        {modelLabel(data.model)}
      </p>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(AgentNodeCard);
