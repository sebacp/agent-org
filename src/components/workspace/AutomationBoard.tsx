import { useState } from "react";
import type { Automation, AutomationDraft } from "@/lib/automation-types";
import { cronFor, describeCron, readCron, type Cadence } from "@/lib/cron";
import { formatCost } from "@/lib/usage";

const WHEN = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const CADENCES: [Cadence, string][] = [
  ["hourly", "Cada hora"],
  ["daily", "Todos los días"],
  ["weekdays", "Días hábiles"],
  ["weekly", "Una vez por semana"],
  ["custom", "Cron a mano"],
];

const DAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

function whenLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : WHEN.format(date);
}

interface Form {
  name: string;
  cadence: Cadence;
  time: string;
  weekday: number;
  cron: string;
  task: string;
  agentId: string;
}

const BLANK: Form = {
  name: "",
  cadence: "daily",
  time: "09:00",
  weekday: 1,
  cron: "0 9 * * *",
  task: "",
  agentId: "",
};

function formFor(automation: Automation): Form {
  const { cadence, time, weekday } = readCron(automation.cron);
  return {
    name: automation.name,
    cadence,
    time,
    weekday,
    cron: automation.cron,
    task: automation.task,
    agentId: automation.agentId,
  };
}

function draftFrom(form: Form, enabled: boolean): AutomationDraft {
  return {
    name: form.name.trim() || "Sin nombre",
    cron:
      form.cadence === "custom"
        ? form.cron.trim()
        : cronFor(form.cadence, form.time, form.weekday),
    // "A las 9" has to mean 9 where you are, not on whatever the server runs on.
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    task: form.task.trim(),
    agentId: form.agentId,
    enabled,
  };
}

// No width of its own: stacked, the column stretches these, and in a row the
// two fields say what they take. `w-full` here would win over both.
const FIELD =
  "rounded-lg border border-hairline bg-panel px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-faint";

/**
 * How the last corrida went, or that there is one going. A corrida fired by the
 * cron leaves nothing on screen while it runs, so without this the row looks
 * the same whether the automation is working or has been idle for a week.
 */
function mark(automation: Automation, live: boolean): string {
  if (live) return "animate-pulse bg-warn";
  if (!automation.enabled) return "border border-hairline";
  if (automation.lastError) return "bg-danger";
  if (automation.runs > 0) return "bg-ok";
  return "border border-faint";
}

interface AutomationBoardProps {
  automations: Automation[];
  /** Names of the ones with a corrida going, whoever set it off. */
  runningNames: string[];
  agents: { id: string; label: string }[];
  onCreate: (draft: AutomationDraft) => Promise<void>;
  onSave: (id: string, patch: Partial<AutomationDraft>) => Promise<void>;
  onRun: (id: string) => Promise<void>;
  onRemove: (id: string) => void;
  onOpenThread: (threadId: string) => void;
}

export default function AutomationBoard({
  automations,
  runningNames,
  agents,
  onCreate,
  onSave,
  onRun,
  onRemove,
  onOpenThread,
}: AutomationBoardProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [running, setRunning] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const openNew = () => {
    setEditing("new");
    setForm(BLANK);
    setFailure(null);
  };

  const openEdit = (automation: Automation) => {
    setEditing(automation.id);
    setForm(formFor(automation));
    setFailure(null);
  };

  const submit = async () => {
    const draft = draftFrom(form, true);
    if (!draft.task) return;
    setFailure(null);
    try {
      if (editing === "new") await onCreate(draft);
      else if (editing) await onSave(editing, draft);
      setEditing(null);
    } catch (caught) {
      setFailure(
        caught instanceof Error ? caught.message : "No pude guardarla.",
      );
    }
  };

  const run = async (automation: Automation) => {
    setRunning(automation.id);
    setFailure(null);
    try {
      await onRun(automation.id);
    } catch (caught) {
      setFailure(
        caught instanceof Error ? caught.message : "Falló la corrida.",
      );
    } finally {
      setRunning(null);
    }
  };

  const fields = (
    // Capped: the pane follows the divider, and a form stretched across a wide
    // one is all box and no content.
    <div className="mt-2 flex max-w-[440px] flex-col gap-1.5">
      <input
        autoFocus
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="Nombre, por ejemplo: Resumen de los lunes"
        className={FIELD}
      />

      <div className="flex gap-1.5">
        <select
          value={form.cadence}
          onChange={(e) => set("cadence", e.target.value as Cadence)}
          className={`${FIELD} min-w-0 flex-1`}
        >
          {CADENCES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        {form.cadence === "hourly" || form.cadence === "custom" ? null : (
          // Wide enough for the AM/PM the browser adds on a 12-hour locale.
          <input
            type="time"
            value={form.time}
            onChange={(e) => set("time", e.target.value)}
            className={`${FIELD} w-[124px] shrink-0`}
          />
        )}
      </div>

      {form.cadence === "weekly" ? (
        <select
          value={form.weekday}
          onChange={(e) => set("weekday", Number(e.target.value))}
          className={FIELD}
        >
          {DAYS.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      ) : null}

      {form.cadence === "custom" ? (
        <input
          value={form.cron}
          onChange={(e) => set("cron", e.target.value)}
          placeholder="0 9 * * 1-5"
          className={`${FIELD} font-mono`}
        />
      ) : null}

      <textarea
        value={form.task}
        onChange={(e) => set("task", e.target.value)}
        rows={3}
        placeholder="Lo mismo que le escribirías en el chat."
        className={`${FIELD} resize-none leading-relaxed placeholder:text-faint`}
      />

      <select
        value={form.agentId}
        onChange={(e) => set("agentId", e.target.value)}
        className={FIELD}
      >
        <option value="">Al CEO, que lo reparta</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.label}
          </option>
        ))}
      </select>

      {failure ? <p className="text-[12px] text-danger">{failure}</p> : null}

      <div className="flex gap-3 text-[13px]">
        <button
          type="button"
          disabled={!form.task.trim()}
          onClick={() => void submit()}
          className="text-ink transition-colors hover:text-dim disabled:text-faint"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="text-faint transition-colors hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-3">
      {editing === "new" ? (
        <div className="px-3 pb-3">{fields}</div>
      ) : (
        <div className="px-3 pb-1">
          <button
            type="button"
            onClick={openNew}
            className="w-full rounded-lg border border-hairline bg-panel px-3 py-2 text-left text-[13px] text-dim transition-colors hover:border-faint hover:text-ink"
          >
            Nueva automatización
          </button>
        </div>
      )}

      {automations.map((automation) => {
        const live =
          running === automation.id || runningNames.includes(automation.name);

        return (
          <div key={automation.id} className="group relative px-3 py-3">
            <span
              className={`absolute top-4 left-0 size-1.5 rounded-full ${mark(automation, live)}`}
            />
            <p
              className={`pr-5 text-[13px] leading-snug ${
                automation.enabled ? "text-ink" : "text-faint"
              }`}
            >
              {automation.name}
            </p>
            <p className="mt-0.5 text-[12px] text-faint">
              {describeCron(automation.cron)}
              {automation.enabled
                ? automation.nextRunAt
                  ? ` · próxima ${whenLabel(automation.nextRunAt)}`
                  : ""
                : " · en pausa"}
            </p>

            <button
              type="button"
              aria-label="Borrar automatización"
              onClick={() => onRemove(automation.id)}
              className="absolute top-2.5 right-0 text-[13px] text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
            >
              ×
            </button>

            {editing === automation.id ? (
              fields
            ) : (
              <>
                <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-line text-dim">
                  {automation.task}
                </p>

                {automation.lastError ? (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-danger">
                    {automation.lastError}
                  </p>
                ) : null}

                {automation.runs > 0 ? (
                  <p className="mt-1.5 text-[12px] text-faint">
                    {automation.runs} corrida{automation.runs === 1 ? "" : "s"}
                    {automation.lastRunAt
                      ? ` · última ${whenLabel(automation.lastRunAt)}`
                      : ""}
                    {automation.cost > 0
                      ? ` · ${formatCost(automation.cost)}`
                      : ""}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
                  <button
                    type="button"
                    disabled={running !== null || live}
                    onClick={() => void run(automation)}
                    className="text-faint transition-colors hover:text-ink disabled:text-faint"
                  >
                    {live ? "Corriendo…" : "Correr ahora"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(automation)}
                    className="text-faint transition-colors hover:text-ink"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void onSave(automation.id, {
                        enabled: !automation.enabled,
                      })
                    }
                    className="text-faint transition-colors hover:text-ink"
                  >
                    {automation.enabled ? "Pausar" : "Reanudar"}
                  </button>
                  {automation.lastThreadId ? (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenThread(automation.lastThreadId ?? "")
                      }
                      className="text-faint transition-colors hover:text-ink"
                    >
                      Ver lo último
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        );
      })}

      {automations.length === 0 && editing !== "new" ? (
        <p className="px-3 py-8 text-[13px] leading-relaxed text-faint">
          Nada programado. Una automatización le hace el mismo pedido a la
          empresa cada tanto, sin que tengas que estar acá.
        </p>
      ) : null}
    </div>
  );
}
