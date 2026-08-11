import Button from "@/components/ui/Button";
import SourceIcon from "@/components/ui/SourceIcon";
import type { GuardState, Guards, WriteGrant } from "@agent-org/shared/guard-types";
import { useSourceCatalog } from "@/lib/source-context";

const WHEN = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function whenLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : WHEN.format(date);
}

/**
 * Everything the company was let do without asking again. It is one list rather
 * than a setting per source because the question it answers is "qué puede pasar
 * sin que yo mire", and that only reads as a list.
 */
export default function SecurityBoard({
  guards,
  onSave,
  onRevoke,
}: {
  guards: GuardState;
  onSave: (patch: Partial<Guards>) => void;
  onRevoke: (sourceId: string, tool: string) => void;
}) {
  // The logo comes off the source as it stands today rather than off the grant,
  // so renaming or moving a source doesn't leave the list showing a brand that
  // is no longer there. A grant outliving its source falls back to the initial.
  const catalog = useSourceCatalog();
  const urlOf = (sourceId: string) =>
    catalog.find((source) => source.id === sourceId)?.url ?? "";

  // Grouped by source: a permission is a thing one server may do, and read as a
  // flat list the same label repeats down the column while the answer you came
  // for —what does this MCP get to do— is spread across it.
  const bySource = new Map<string, WriteGrant[]>();
  for (const grant of guards.grants) {
    bySource.set(grant.sourceId, [
      ...(bySource.get(grant.sourceId) ?? []),
      grant,
    ]);
  }
  const groups = [...bySource.values()]
    .map((list) => [...list].sort((a, b) => a.tool.localeCompare(b.tool)))
    .sort((a, b) => a[0].sourceLabel.localeCompare(b[0].sourceLabel));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <label className="flex cursor-pointer items-start gap-2 px-3 py-2">
        <input
          type="checkbox"
          checked={guards.approveWrites}
          onChange={(event) => onSave({ approveWrites: event.target.checked })}
          className="mt-0.5 accent-ink"
        />
        <span className="min-w-0">
          <span className="block text-[13px] text-ink">
            Pedirme permiso para escribir
          </span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">
            Cualquier función de una fuente que no sea de sólo lectura frena
            hasta que la autorices. Sin esto, los permisos de abajo no cambian
            nada: ya no se pregunta por ninguno.
          </span>
        </span>
      </label>

      <p className="mt-4 border-t border-hairline px-3 pt-3 text-[12px] tracking-wide text-faint uppercase">
        Permisos otorgados
      </p>

      {groups.length === 0 ? (
        <p className="px-3 py-6 text-[13px] leading-relaxed text-faint">
          Ninguno todavía. Cada vez que autorices una escritura podés marcar “no
          volver a preguntar”, y esa función queda acá.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group[0].sourceId} className="mt-1 px-3 py-2">
            <p className="flex items-center gap-2">
              <SourceIcon
                label={group[0].sourceLabel}
                url={urlOf(group[0].sourceId)}
                size={16}
              />
              <span className="min-w-0 truncate text-[13px] text-ink">
                {group[0].sourceLabel}
              </span>
            </p>

            {group.map((grant) => (
              <div
                key={grant.tool}
                className="mt-1.5 flex items-center gap-2 pl-6"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-dim">
                  {grant.tool}
                </span>
                <span className="shrink-0 text-[12px] text-faint">
                  {whenLabel(grant.grantedAt)}
                </span>
                {/* Taking it back only puts the question back; nothing already
                  written comes undone, so this is not a destructive button. */}
                <Button
                  size="sm"
                  onClick={() => onRevoke(grant.sourceId, grant.tool)}
                >
                  Revocar
                </Button>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
