import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { fetchFile } from "@/lib/api";
import type { FileRecord } from "@/lib/file-types";

export default function FileViewer({
  orgId,
  fileId,
  onClose,
}: {
  orgId: string;
  fileId: string;
  onClose: () => void;
}) {
  const [file, setFile] = useState<FileRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFile(orgId, fileId)
      .then(setFile)
      .catch(() => setError("No pude abrir el archivo."));
  }, [fileId, orgId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-ink/15"
      />

      <article className="relative flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-hairline bg-panel">
        <header className="flex items-start gap-4 border-b border-hairline px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-medium text-ink">
              {file?.title ?? "Archivo"}
            </h2>
            {file ? (
              <p className="mt-1 text-[12px] text-faint">
                {[file.author, file.area, ...file.tags]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
          <Button onClick={onClose}>Cerrar</Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <p className="text-[13px] text-red-700">{error}</p>
          ) : file ? (
            <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-ink">
              {file.content}
            </p>
          ) : (
            <p className="text-[13px] text-faint">Abriendo…</p>
          )}
        </div>
      </article>
    </div>
  );
}
