import { useState } from "react";
import { room, type GuardState, type Guards } from "@agent-org/shared/guard-types";
import { formatCost } from "@agent-org/shared/usage";

/**
 * What the company has spent this month and what it is allowed to. Both
 * resguardos live here rather than behind a settings screen: the number is the
 * reason the tope exists, and a tope you have to go looking for is one nobody
 * sets.
 */
export default function SpendMeter({
  guards,
  onSave,
}: {
  guards: GuardState;
  onSave: (patch: Partial<Guards>) => void;
}) {
  // Null while it is closed: the box is filled from the saved tope the moment
  // it opens, so a number arriving from the server mid-edit can't overwrite
  // what is being typed.
  const [draft, setDraft] = useState<string | null>(null);
  const open = draft !== null;

  const left = room(guards);
  const filled =
    guards.monthlyCap > 0
      ? Math.min(100, (guards.spent / guards.monthlyCap) * 100)
      : 0;
  // The bar only speaks up once being near the tope is news; below that it is
  // the same hairline as everything else on the rail.
  const near = left !== null && filled >= 80;

  const commit = () => {
    const typed = Number((draft ?? "").replace(",", "."));
    onSave({ monthlyCap: Number.isFinite(typed) && typed > 0 ? typed : 0 });
    setDraft(null);
  };

  return (
    <div className="border-t border-hairline px-3 py-3">
      <button
        type="button"
        onClick={() =>
          setDraft((current) =>
            current === null
              ? guards.monthlyCap > 0
                ? String(guards.monthlyCap)
                : ""
              : null,
          )
        }
        className="w-full rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-raised/60"
      >
        <span className="flex items-baseline gap-1.5">
          <span className="text-[13px] text-dim">
            {formatCost(guards.spent)}
          </span>
          <span className="text-[12px] text-faint">
            {left === null
              ? "este mes · sin tope"
              : `de ${formatCost(guards.monthlyCap)}`}
          </span>
        </span>
        {left === null ? null : (
          <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-hairline">
            <span
              style={{ width: `${filled}%` }}
              className={`block h-full ${near ? "bg-warn" : "bg-dim/50"}`}
            />
          </span>
        )}
      </button>

      {open ? (
        <div className="mt-2 rounded-lg border border-hairline bg-panel px-3 py-2.5">
          <label className="block text-[12px] text-faint">
            Tope del mes, en dólares
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              value={draft ?? ""}
              autoFocus
              inputMode="decimal"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setDraft(null);
              }}
              placeholder="Sin tope"
              className="min-w-0 flex-1 rounded-lg border border-hairline bg-canvas px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-faint"
            />
            <button
              type="button"
              onClick={commit}
              className="shrink-0 text-[13px] text-ink transition-opacity hover:opacity-70"
            >
              Guardar
            </button>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
            Llegado el tope se corta lo que esté corriendo y no arranca nada
            nuevo hasta el mes que viene. Vacío es sin tope.
          </p>
        </div>
      ) : null}
    </div>
  );
}
