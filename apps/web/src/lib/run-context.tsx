import { createContext, useContext, type ReactNode } from "react";
import type { AgentStatus } from "@agent-org/shared/run-types";

// Same constraint as `DepartmentsContext`: node cards are rendered from
// module-scope `nodeTypes`, so live status can't arrive as a prop.
const RunStatusContext = createContext<Record<string, AgentStatus>>({});

export function RunStatusProvider({
  value,
  children,
}: {
  value: Record<string, AgentStatus>;
  children: ReactNode;
}) {
  return (
    <RunStatusContext.Provider value={value}>
      {children}
    </RunStatusContext.Provider>
  );
}

export function useAgentStatus(id: string): AgentStatus {
  return useContext(RunStatusContext)[id] ?? "idle";
}
