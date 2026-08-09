import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/router";
import Button from "@/components/ui/Button";
import { removeOrgFiles } from "@/lib/api";
import { parseOrgFile } from "@/lib/io";
import {
  createOrg,
  createOrgFromFile,
  listOrgs,
  removeOrg,
  type LibraryEntry,
} from "@/lib/library";
import { exampleOrg, seedOrg } from "@/lib/seed";

const WHEN = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function savedLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : WHEN.format(date);
}

export default function Library() {
  const router = useRouter();
  const [entries, setEntries] = useState<LibraryEntry[]>(listOrgs);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = useCallback(
    (id: string) => {
      void router.push(`/org/${id}`);
    },
    [router],
  );

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[860px] px-6 py-16">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-[460px]">
            <h1 className="text-[27px] leading-tight font-semibold tracking-tight text-ink">
              Tus empresas
            </h1>
            <p className="mt-2.5 text-[15px] leading-relaxed text-dim">
              Cada una tiene su propio organigrama, sus áreas y su equipo de
              agentes. Abrí la que quieras poner a trabajar.
            </p>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={() => open(createOrg(seedOrg()))}
          >
            Nueva empresa
          </Button>
        </header>

        <div className="mt-10 flex flex-col gap-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="group flex items-center gap-4 rounded-xl border border-hairline bg-panel px-5 py-4 transition-colors hover:border-faint"
            >
              <button
                type="button"
                onClick={() => open(entry.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-[16px] font-medium text-ink">
                  {entry.name || "Sin nombre"}
                </span>
                <span className="mt-1 block text-[13px] text-dim">
                  {entry.agents} {entry.agents === 1 ? "agente" : "agentes"} ·{" "}
                  {entry.areas} {entry.areas === 1 ? "área" : "áreas"}
                  {savedLabel(entry.savedAt)
                    ? ` · ${savedLabel(entry.savedAt)}`
                    : ""}
                </span>
              </button>

              {confirmId === entry.id ? (
                <>
                  <span className="text-[13px] text-dim">¿Borrar?</span>
                  <Button
                    variant="danger"
                    onClick={() => {
                      removeOrg(entry.id);
                      // The chart lives in the browser, the files on disk.
                      void removeOrgFiles(entry.id).catch(() => undefined);
                      setEntries(listOrgs());
                      setConfirmId(null);
                    }}
                  >
                    Sí, borrar
                  </Button>
                  <Button onClick={() => setConfirmId(null)}>Cancelar</Button>
                </>
              ) : (
                <Button
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                  onClick={() => setConfirmId(entry.id)}
                >
                  Borrar
                </Button>
              )}
            </div>
          ))}

          {entries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-hairline px-5 py-10 text-center text-[15px] text-dim">
              Todavía no armaste ninguna. Empezá con una nueva o mirá el
              ejemplo.
            </p>
          ) : null}
        </div>

        <footer className="mt-8 flex flex-wrap items-center gap-2 border-t border-hairline pt-6">
          <Button onClick={() => open(createOrg(exampleOrg(), 5))}>
            Cargar el ejemplo
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            Importar archivo
          </Button>
          {error ? (
            <span className="text-[13px] text-red-700">{error}</span>
          ) : null}
        </footer>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setError(null);
          try {
            open(createOrgFromFile(parseOrgFile(await file.text())));
          } catch {
            setError("Archivo inválido");
          }
        }}
      />
    </div>
  );
}
