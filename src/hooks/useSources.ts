import { useCallback, useEffect, useState } from "react";
import { fetchSources, removeSource, saveSource } from "@/lib/api";
import type { SourceDraft, SourceProbe, SourceView } from "@/lib/source-types";

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
    async (input: SourceDraft) => {
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

  // The sign-in happens in a window of its own, so the only way this one learns
  // how it went is for that window to say so on its way out.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { tag?: string; sourceId?: string } | null;
      if (data?.tag !== "agent-org-oauth" || !data.sourceId) return;
      void save({ id: data.sourceId });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [save]);

  // That message doesn't always arrive: an authorization page that sends COOP
  // severs `window.opener`, and then the tools the sign-in just discovered sit
  // on the server unseen until somebody reloads. Coming back to this window is
  // the other cue that something may have happened elsewhere.
  useEffect(() => {
    let live = true;
    const onFocus = () => {
      void fetchSources(orgId)
        .then((list) => {
          if (live) setSources(list);
        })
        .catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      live = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [orgId]);

  const remove = useCallback(
    async (id: string) => {
      setSources((current) => current.filter((s) => s.id !== id));
      await removeSource(orgId, id).catch(() => undefined);
    },
    [orgId],
  );

  return { sources, probes, save, remove };
}
