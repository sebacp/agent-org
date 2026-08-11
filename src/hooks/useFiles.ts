import { useCallback, useEffect, useState } from "react";
import { fetchFiles, removeFile } from "@/lib/api";
import type { FileMeta } from "@/lib/file-types";

export function useFiles(orgId: string) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(
    () => fetchFiles(orgId, { query }).catch(() => []),
    [orgId, query],
  );

  // Typing hits the index on the server, so the search is debounced; a slow
  // answer to an older query must not overwrite a newer one.
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(
      () => {
        void load().then((list) => {
          if (live) setFiles(list);
        });
      },
      query ? 250 : 0,
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [load, query]);

  const refresh = useCallback(async () => {
    setFiles(await load());
  }, [load]);

  const remove = useCallback(
    async (id: string) => {
      setFiles((current) => current.filter((f) => f.id !== id));
      await removeFile(orgId, id).catch(() => undefined);
    },
    [orgId],
  );

  return { files, query, setQuery, refresh, remove };
}
