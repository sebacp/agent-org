import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Markdown from "@/components/ui/Markdown";
import type { LiveText } from "@/hooks/useOrgRun";
import type { ThreadStep } from "@/lib/run-types";
import {
  formatCost,
  formatTokens,
  totalTokens,
  type RunUsage,
} from "@/lib/usage";

/** Reasoning runs long and only its end is news; the rest is scrollback. */
const TAIL = 400;

interface ConversationProps {
  companyName: string;
  task: string | null;
  trace: ThreadStep[];
  usage: RunUsage;
  /** What the root agent is writing right now, before any of it is a result. */
  live: LiveText;
  answer: string | null;
  error: string | null;
  running: boolean;
  /** Somebody else's corrida: this tab reads it and can't cut it short. */
  watching: boolean;
  onStart: (task: string) => void;
  onStop: () => void;
}

function TraceLine({
  step,
  /** The newest line while the corrida is still going: nothing follows it yet. */
  active = false,
}: {
  step: ThreadStep;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (step.kind === "result") {
    return (
      <div className="rounded-lg border border-hairline bg-panel">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <Avatar seed={step.agentId} size={20} />
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
            {step.role || "Agente"} respondió
          </span>
          <span className="text-[11px] text-faint">
            {open ? "Ocultar" : "Ver"}
          </span>
        </button>
        {open ? (
          <Markdown className="border-t border-hairline px-3 py-2.5 text-[12px] text-dim">
            {step.text}
          </Markdown>
        ) : null}
      </div>
    );
  }

  const failed = step.kind === "failed";

  return (
    <p
      className={`flex gap-2 px-1 text-[12px] leading-relaxed ${
        failed ? "text-red-700" : "text-faint"
      }`}
    >
      <Avatar seed={step.agentId} size={18} className="mt-px" />
      <span className="min-w-0">
        <span className={failed ? "" : "text-dim"}>
          {step.role || "Agente"}
        </span>{" "}
        {step.kind === "delegate"
          ? "le pasó a "
          : failed
            ? "no pudo terminar · "
            : ""}
        {step.text}
        {/* A failure is an ending; anything else still has something behind it. */}
        {active && !failed ? (
          <span className="ml-1.5 inline-block size-2.5 animate-spin rounded-full border border-hairline border-t-dim align-[-1px]" />
        ) : null}
      </span>
    </p>
  );
}

export default function Conversation({
  companyName,
  task,
  trace,
  usage,
  live,
  answer,
  error,
  running,
  watching,
  onStart,
  onStop,
}: ConversationProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const tokens = totalTokens(usage);
  const prompt = usage.cached + usage.input;
  const cacheHit = prompt > 0 ? Math.round((usage.cached / prompt) * 100) : 0;
  // Once it starts writing it has stopped reasoning, and the answer says more.
  const thinking = live.answer ? "" : live.thinking;
  const text = answer ?? (live.answer || null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [trace.length, thinking.length, text, error]);

  const submit = () => {
    const text = draft.trim();
    if (!text || running) return;
    setDraft("");
    onStart(text);
  };

  return (
    // A column of its own once the pane sits beside it; the whole width until
    // then, where the pane is a drawer over the top.
    <section className="flex min-w-0 flex-1 flex-col bg-canvas lg:w-[var(--chat)] lg:flex-none">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[680px] px-8 py-10">
          {task === null ? (
            <div className="pt-16 text-center">
              <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-ink">
                ¿Qué le pedís a {companyName || "la empresa"}?
              </h1>
              <p className="mx-auto mt-2.5 max-w-[420px] text-[14px] leading-relaxed text-dim">
                Se lo das al CEO. Él lo reparte entre su equipo, cada uno usa la
                biblioteca de la empresa, y volvés a tener una sola respuesta.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[16px] leading-relaxed whitespace-pre-line text-ink">
                {task}
              </p>

              {trace.length > 0 || thinking ? (
                <div className="mt-7 flex flex-col gap-1.5 border-l border-hairline pl-4">
                  {trace.map((step, index) => (
                    <TraceLine
                      key={`${step.agentId}-${index}`}
                      step={step}
                      // Once it is reasoning or writing below, the last line is
                      // no longer where the corrida is.
                      active={
                        running &&
                        !thinking &&
                        !text &&
                        index === trace.length - 1
                      }
                    />
                  ))}
                  {/* The last line of the trace until something replaces it:
                    what it is reasoning, cut to its end so a long deliberation
                    doesn't push the rest of the corrida off screen. */}
                  {thinking ? (
                    <p className="px-1 text-[12px] leading-relaxed whitespace-pre-line text-faint">
                      {thinking.length > TAIL
                        ? `…${thinking.slice(-TAIL)}`
                        : thinking}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {running && trace.length === 0 && !thinking && !text ? (
                <p className="mt-7 text-[13px] text-faint">
                  El CEO está repartiendo el encargo…
                </p>
              ) : null}

              {error ? (
                <p className="mt-7 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-700">
                  {error}
                </p>
              ) : null}

              {/* The same card whether it is still being written or finished:
                the text just stops growing. */}
              {text ? (
                <div className="mt-7 rounded-xl border border-hairline bg-panel px-5 py-4">
                  <p className="text-[11px] tracking-wide text-faint uppercase">
                    {companyName || "La empresa"}
                  </p>
                  <Markdown className="mt-2 text-[14px] text-ink">{text}</Markdown>
                </div>
              ) : null}

              {tokens > 0 ? (
                <p className="mt-3 px-1 text-[11px] text-faint">
                  {formatTokens(tokens)} tokens · {formatCost(usage.cost)}
                  {cacheHit > 0 ? ` · ${cacheHit}% desde caché` : ""}
                </p>
              ) : null}
            </>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-hairline bg-chrome">
        <div className="mx-auto w-full max-w-[680px] px-8 py-4">
          <div className="flex items-end gap-3 rounded-xl border border-hairline bg-panel px-4 py-3">
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Armá el plan para entrar al mercado mexicano el próximo trimestre."
              className="min-w-0 flex-1 resize-none bg-transparent text-[14px] leading-relaxed text-ink outline-none placeholder:text-faint"
            />
            {running && watching ? (
              <Button onClick={onStop}>Dejar de seguir</Button>
            ) : running ? (
              <Button variant="danger" onClick={onStop}>
                Cortar
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={!draft.trim()}
                onClick={submit}
              >
                Enviar
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
