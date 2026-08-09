import { useCallback, useEffect, useState } from "react";
import { fetchSources, removeSource, saveSource } from "@/lib/api";
import type { SourceProbe, SourceView } from "@/lib/source-types";

export function useSources(orgId: string) {
  const [sources, setSources] = useState<SourceView[]>([]);
  /** How the last connection attempt went, keyed by source id. */
  const [probes, setProbes] = useState<Record<string, SourceProbe>>({});

  useEffect(() => {
    let live = true;
    void fetchSources(orgId)
      .catch(() => [])
      .then((list) => {
        if (live) setSources(list);
      });
    return () => {
      live = false;
    };
  }, [orgId]);

  const save = useCallback(
    async (input: Partial<SourceView> & { token?: string }) => {
      const { source, probe } = await saveSource(orgId, input);
      setSources((current) =>
        current.some((s) => s.id === source.id)
          ? current.map((s) => (s.id === source.id ? source : s))
          : [...current, source],
      );
      setProbes((current) => ({ ...current, [source.id]: probe }));
      return probe;
    },
    [orgId],
  );

  const remove = useCallback(
    async (id: string) => {
      setSources((current) => current.filter((s) => s.id !== id));
      await removeSource(orgId, id).catch(() => undefined);
    },
    [orgId],
  );

  return { sources, probes, save, remove };
}
