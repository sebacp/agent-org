import { createContext, useContext, type ReactNode } from "react";
import type { DepartmentDef } from "@agent-org/shared/types";

// React Flow renders nodes from module-scope `nodeTypes`, so cards can't be
// handed the department list as a prop.
const DepartmentsContext = createContext<DepartmentDef[]>([]);

export function DepartmentsProvider({
  value,
  children,
}: {
  value: DepartmentDef[];
  children: ReactNode;
}) {
  return (
    <DepartmentsContext.Provider value={value}>
      {children}
    </DepartmentsContext.Provider>
  );
}

export function useDepartments(): DepartmentDef[] {
  return useContext(DepartmentsContext);
}
