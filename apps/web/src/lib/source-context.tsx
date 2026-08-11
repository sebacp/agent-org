import { createContext, useContext, type ReactNode } from "react";
import type { SourceView } from "@agent-org/shared/source-types";

// Same reason as the departments context: React Flow renders node cards from
// module-scope `nodeTypes`, so they can't be handed the source list as a prop.
const SourcesContext = createContext<SourceView[]>([]);

export function SourcesProvider({
  value,
  children,
}: {
  value: SourceView[];
  children: ReactNode;
}) {
  return (
    <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>
  );
}

export function useSourceCatalog(): SourceView[] {
  return useContext(SourcesContext);
}
