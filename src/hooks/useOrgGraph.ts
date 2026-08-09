import { useCallback, useEffect, useState } from "react";
import {
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
} from "@xyflow/react";
import { newId } from "@/lib/id";
import { downloadOrg, parseOrgFile } from "@/lib/io";
import { autoLayout } from "@/lib/layout";
import {
  DEPARTMENT_CATALOG,
  ROOT_DEPARTMENT,
  type RolePreset,
} from "@/lib/roles";
import { exampleOrg, seedOrg, type OrgState } from "@/lib/seed";
import { readOrg, readStep, writeStep } from "@/lib/library";
import type {
  AgentData,
  AgentNode,
  CompanyProfile,
  DepartmentDef,
  OrgEdge,
} from "@/lib/types";

export type Step = 1 | 2 | 3 | 4;
export const STEPS = [
  { id: 1, label: "Empresa" },
  { id: 2, label: "Áreas" },
  { id: 3, label: "Equipo" },
  { id: 4, label: "Organigrama" },
] as const;

/**
 * The first member of an area reports to the CEO and thereby becomes its lead;
 * everyone added after that reports to the lead. This is what lets the wizard
 * build a hierarchy without asking anyone to draw a single arrow.
 */
function pickParent(
  department: string,
  nodes: AgentNode[],
  edges: OrgEdge[],
): string | null {
  const root = nodes.find((n) => n.data.department === ROOT_DEPARTMENT);
  if (!root) return null;
  if (department === ROOT_DEPARTMENT) return root.id;

  const reportsToRoot = new Set(
    edges
      .filter((e) => e.source === root.id && e.data?.kind !== "link")
      .map((e) => e.target),
  );
  const lead = nodes.find(
    (n) => n.data.department === department && reportsToRoot.has(n.id),
  );
  return lead?.id ?? root.id;
}

/**
 * Reads localStorage during initialization, so every consumer must be
 * client-only. `OrgEditor` is mounted with `ssr: false` for that reason.
 */
export function useOrgGraph(orgId: string) {
  const [initial] = useState<OrgState>(() => readOrg(orgId) ?? seedOrg());
  const [company, setCompany] = useState<CompanyProfile>(initial.company);
  const [departments, setDepartments] = useState<DepartmentDef[]>(
    initial.departments,
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNode>(
    initial.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<OrgEdge>(initial.edges);
  const [step, setStep] = useState<Step>(
    () => readStep(orgId, initial.company.name ? 4 : 1) as Step,
  );
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);
  const { fitView } = useReactFlow<AgentNode, OrgEdge>();

  useEffect(() => writeStep(orgId, step), [orgId, step]);

  const refit = useCallback(() => {
    window.requestAnimationFrame(() => {
      void fitView({ duration: 320, padding: 0.24 });
    });
  }, [fitView]);

  const load = useCallback(
    (next: OrgState) => {
      setCompany(next.company);
      setDepartments(next.departments);
      setNodes(next.nodes);
      setEdges(next.edges);
      setOpenAgentId(null);
    },
    [setEdges, setNodes],
  );

  const updateCompany = useCallback((patch: Partial<CompanyProfile>) => {
    setCompany((current) => ({ ...current, ...patch }));
  }, []);

  // --- Areas ---------------------------------------------------------------

  const toggleDepartment = useCallback(
    (id: string) => {
      if (id === ROOT_DEPARTMENT) return;
      if (departments.some((d) => d.id === id)) {
        const dropped = new Set(
          nodes.filter((n) => n.data.department === id).map((n) => n.id),
        );
        const nextEdges = edges.filter(
          (e) => !dropped.has(e.source) && !dropped.has(e.target),
        );
        setDepartments(departments.filter((d) => d.id !== id));
        setNodes(autoLayout(nodes.filter((n) => !dropped.has(n.id)), nextEdges));
        setEdges(nextEdges);
        return;
      }
      const fromCatalog = DEPARTMENT_CATALOG.find((d) => d.id === id);
      if (fromCatalog) setDepartments([...departments, { ...fromCatalog }]);
    },
    [departments, edges, nodes, setEdges, setNodes],
  );

  const addDepartment = useCallback((): string => {
    const department: DepartmentDef = {
      id: newId("dep"),
      label: "",
      mission: "",
    };
    setDepartments((current) => [...current, department]);
    return department.id;
  }, []);

  const updateDepartment = useCallback(
    (id: string, patch: Partial<Omit<DepartmentDef, "id">>) => {
      setDepartments((current) =>
        current.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      );
    },
    [],
  );

  // --- Agents --------------------------------------------------------------

  const addAgent = useCallback(
    (preset: RolePreset, department = preset.department): string => {
      const node: AgentNode = {
        id: newId("ag"),
        type: "agent",
        position: { x: 0, y: 0 },
        data: {
          role: preset.role,
          name: preset.name,
          department,
          model: preset.model,
          instructions: preset.instructions,
        },
      };
      const parentId = pickParent(department, nodes, edges);
      const nextEdges: OrgEdge[] = parentId
        ? [
            ...edges,
            {
              id: newId("e"),
              type: "org",
              source: parentId,
              target: node.id,
              data: { kind: "delegates" },
            },
          ]
        : edges;
      setNodes(autoLayout([...nodes, node], nextEdges));
      setEdges(nextEdges);
      return node.id;
    },
    [edges, nodes, setEdges, setNodes],
  );

  // Whoever reported to the removed agent is adopted by its manager, so no
  // branch of the org ever gets stranded off the chart.
  const removeAgent = useCallback(
    (id: string) => {
      const isDelegation = (e: OrgEdge) => e.data?.kind !== "link";
      const parent = edges.find((e) => e.target === id && isDelegation(e))
        ?.source;
      const orphans = edges
        .filter((e) => e.source === id && isDelegation(e))
        .map((e) => e.target);

      let nextEdges = edges.filter((e) => e.source !== id && e.target !== id);
      if (parent) {
        nextEdges = [
          ...nextEdges,
          ...orphans.map((target) => ({
            id: newId("e"),
            type: "org" as const,
            source: parent,
            target,
            data: { kind: "delegates" as const },
          })),
        ];
      }
      setNodes(autoLayout(nodes.filter((n) => n.id !== id), nextEdges));
      setEdges(nextEdges);
      setOpenAgentId((current) => (current === id ? null : current));
    },
    [edges, nodes, setEdges, setNodes],
  );

  const updateAgent = useCallback(
    (id: string, patch: Partial<AgentData>) => {
      setNodes((current) =>
        current.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
    },
    [setNodes],
  );

  const toggleRole = useCallback(
    (preset: RolePreset, department: string) => {
      const existing = nodes.find(
        (n) => n.data.role === preset.role && n.data.department === department,
      );
      if (existing) removeAgent(existing.id);
      else addAgent(preset, department);
    },
    [addAgent, nodes, removeAgent],
  );

  // --- Canvas --------------------------------------------------------------

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      setEdges((current) =>
        addEdge<OrgEdge>(
          {
            ...connection,
            id: newId("e"),
            type: "org",
            data: { kind: "delegates" },
          },
          current,
        ),
      );
    },
    [setEdges],
  );

  const runAutoLayout = useCallback(() => {
    setNodes(autoLayout(nodes, edges));
    refit();
  }, [edges, nodes, refit, setNodes]);

  // --- Navigation ----------------------------------------------------------

  const goToStep = useCallback((next: Step) => {
    setStep(next);
    setOpenAgentId(null);
  }, []);

  // --- File ----------------------------------------------------------------

  const exportOrg = useCallback(
    () => downloadOrg(company, departments, nodes, edges),
    [company, departments, nodes, edges],
  );

  const importOrg = useCallback(
    async (file: File) => {
      load(parseOrgFile(await file.text()));
      setStep(4);
      refit();
    },
    [load, refit],
  );

  const loadExample = useCallback(() => {
    load(exampleOrg());
    setStep(4);
    refit();
  }, [load, refit]);

  const openAgent =
    nodes.find((n) => n.id === openAgentId) ?? null;

  return {
    company,
    departments,
    nodes,
    edges,
    step,
    openAgent,
    onNodesChange,
    onEdgesChange,
    onConnect,
    updateCompany,
    toggleDepartment,
    addDepartment,
    updateDepartment,
    addAgent,
    removeAgent,
    updateAgent,
    toggleRole,
    setOpenAgentId,
    goToStep,
    runAutoLayout,
    exportOrg,
    importOrg,
    loadExample,
  };
}

export type OrgGraph = ReturnType<typeof useOrgGraph>;
