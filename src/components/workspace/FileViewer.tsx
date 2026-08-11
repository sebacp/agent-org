import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Markdown from "@/components/ui/Markdown";
import { fetchFile, fileRawUrl } from "@/lib/api";
import { fileSize, isDataset, isImage, type FileRecord } from "@/lib/file-types";

/** Data you uploaded is not prose: Markdown would swallow its line breaks. */
const RAW = /\.(csv|tsv|json|ya?ml|log)$/i;

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
            <>
              {/* A dump that stopped short adds up to a figure that reads like
                a total, so whoever opens it has to be told before they read a
                single row. */}
              {file.partial ? (
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-900">
                  Este volcado quedó incompleto: faltan registros. {file.partial}
                </p>
              ) : null}
              {/* Complete, and still not the listing. Which part of it this is
                only shows in what was asked for. */}
              {file.asked ? (
                <p className="mb-4 rounded-lg border border-hairline bg-panel px-4 py-3 text-[12px] leading-relaxed text-dim">
                  Se pidió a la fuente con{" "}
                  <span className="font-mono text-[11px] text-ink">
                    {file.asked}
                  </span>
                  . Lo que no cumpla eso no está en este archivo.
                </p>
              ) : null}
              {isImage(file) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileRawUrl(orgId, file.id)}
                  alt={file.title}
                  className="mx-auto max-w-full rounded-lg"
                />
              ) : file.mime ? (
                <div className="py-6 text-center">
                  <p className="text-[13px] text-dim">
                    {file.mime} · {fileSize(file)}
                  </p>
                  <a
                    href={fileRawUrl(orgId, file.id)}
                    download={file.title}
                    className="mt-3 inline-block text-[13px] text-ink underline underline-offset-4"
                  >
                    Descargar
                  </a>
                </div>
              ) : isDataset(file) || RAW.test(file.title) ? (
                <pre className="overflow-x-auto text-[12px] leading-relaxed whitespace-pre text-ink">
                  {file.content}
                </pre>
              ) : (
                <Markdown className="text-[14px] text-ink">
                  {file.content}
                </Markdown>
              )}
              {!file.mime && file.content.length < file.chars ? (
                <p className="mt-4 border-t border-hairline pt-3 text-[12px] text-faint">
                  {isDataset(file)
                    ? `Un volcado de ${fileSize(file)}. Esto es el principio; los agentes lo consultan entero sin abrirlo.`
                    : `Mostrando los primeros ${file.content.length.toLocaleString("es-AR")} caracteres de ${file.chars.toLocaleString("es-AR")}.`}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[13px] text-faint">Abriendo…</p>
          )}
        </div>
      </article>
    </div>
  );
}
