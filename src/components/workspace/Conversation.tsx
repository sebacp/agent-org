import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Markdown from "@/components/ui/Markdown";
import SourceIcon from "@/components/ui/SourceIcon";
import type { LiveText } from "@/hooks/useOrgRun";
import type { ThreadStep, Turn } from "@/lib/run-types";
import {
  formatCost,
  formatTokens,
  NO_USAGE,
  totalTokens,
  type RunUsage,
} from "@/lib/usage";

/** Reasoning runs long and only its end is news; the rest is scrollback. */
const TAIL = 400;

/** What only the exchange happening right now has. */
interface Live {
  thinking: string;
  running: boolean;
  error: string | null;
}

interface ConversationProps {
  companyName: string;
  /** The exchanges of this hilo that already closed, oldest first. */
  turns: Turn[];
  task: string | null;
  trace: ThreadStep[];
  usage: RunUsage;
  /** What the root agent is writing right now, before any of it is a result. */
  live: LiveText;
  answer: string | null;
  error: string | null;
  running: boolean;
  /** Somebody else's corrida: this tab is only reading it. */
  watching: boolean;
  onStart: (task: string) => void;
  /** Stop reading. Whatever is running keeps running. */
  onStop: () => void;
  /** End the corrida itself, wherever it is running. */
  onCut: () => void;
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
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
            {step.role || "Agente"} respondió
          </span>
          <span className="text-[12px] text-faint">
            {open ? "Ocultar" : "Ver"}
          </span>
        </button>
        {open ? (
          <Markdown className="border-t border-hairline px-3 py-2.5 text-[13px] text-dim">
            {step.text}
          </Markdown>
        ) : null}
      </div>
    );
  }

  const failed = step.kind === "failed";

  const line = (
    <p
      className={`flex gap-2 px-1 text-[13px] leading-relaxed ${
        failed ? "text-danger" : "text-faint"
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
        {/* Whose data it was, as a mark on the line rather than one more word
          in it: the summary says what happened, the chip says where. */}
        {step.source ? (
          <span className="ml-1.5 inline-flex items-center gap-1 rounded-md border border-hairline bg-panel px-1.5 py-px align-[-4px] text-[12px] text-dim">
            <SourceIcon
              label={step.source.label}
              url={step.source.url}
              size={12}
            />
            {step.source.label}
          </span>
        ) : null}
        {/* What the line is a summary of. A número nobody can check is a número
          nobody can contradict, which is how two agents agree on a wrong one.
          For a source it is the exchange itself: the line is the model's
          account of the answer, this is the answer. */}
        {step.detail ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-1.5 text-[12px] text-faint underline decoration-hairline underline-offset-2 transition-colors hover:text-ink"
          >
            {open
              ? "ocultar"
              : step.source
                ? "ver la respuesta"
                : "ver la cuenta"}
          </button>
        ) : null}
        {/* A failure is an ending; anything else still has something behind it. */}
        {active && !failed ? (
          <span className="ml-1.5 inline-block size-2.5 animate-spin rounded-full border border-hairline border-t-dim align-[-1px]" />
        ) : null}
      </span>
    </p>
  );

  if (!step.detail) return line;

  return (
    <div>
      {line}
      {/* An answer arrives as one line of JSON as often as not, so it wraps
        rather than scrolls, and is boxed: some of them are thousands of lines
        and the rest of the trace still has to be readable. */}
      {open ? (
        <pre className="mt-1.5 ml-6 max-h-96 overflow-auto rounded-lg border border-hairline bg-panel px-3 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-dim">
          {step.detail}
        </pre>
      ) : null}
    </div>
  );
}

/**
 * One pedido and everything it set off. A finished one folds its trace away —
 * what it produced is the answer, and the hilo above it has to stay readable —
 * while the one running keeps it open, because that is where it currently is.
 */
function Exchange({
  companyName,
  turn,
  live,
}: {
  companyName: string;
  turn: Turn;
  live?: Live;
}) {
  const [open, setOpen] = useState(false);
  const steps = turn.steps;
  const usage = turn.usage ?? NO_USAGE;
  const tokens = totalTokens(usage);
  const prompt = usage.cached + usage.input;
  const cacheHit = prompt > 0 ? Math.round((usage.cached / prompt) * 100) : 0;
  const thinking = live?.thinking ?? "";

  return (
    <div>
      <p className="text-[16px] leading-relaxed whitespace-pre-line text-ink">
        {turn.task}
      </p>

      {!live && steps.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 text-[13px] text-faint transition-colors hover:text-ink"
        >
          {open
            ? "Ocultar los pasos"
            : steps.length === 1
              ? "Ver el paso"
              : `Ver los ${steps.length} pasos`}
        </button>
      ) : null}

      {(live || open) && (steps.length > 0 || thinking) ? (
        <div
          className={`${
            live ? "mt-7" : "mt-3"
          } flex flex-col gap-1.5 border-l border-hairline pl-4`}
        >
          {steps.map((step, index) => (
            <TraceLine
              key={`${step.agentId}-${index}`}
              step={step}
              // Once it is reasoning or writing below, the last line is no
              // longer where the corrida is.
              active={
                live?.running &&
                !thinking &&
                !turn.answer &&
                index === steps.length - 1
              }
            />
          ))}
          {/* The last line of the trace until something replaces it: what it is
            reasoning, cut to its end so a long deliberation doesn't push the
            rest of the corrida off screen. */}
          {thinking ? (
            <p className="px-1 text-[13px] leading-relaxed whitespace-pre-line text-faint">
              {thinking.length > TAIL ? `…${thinking.slice(-TAIL)}` : thinking}
            </p>
          ) : null}
        </div>
      ) : null}

      {live?.running && steps.length === 0 && !thinking && !turn.answer ? (
        <p className="mt-7 text-[13px] text-faint">
          El CEO está repartiendo el encargo…
        </p>
      ) : null}

      {live?.error ? (
        <p className="mt-7 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-[13px] leading-relaxed text-danger">
          {live.error}
        </p>
      ) : null}

      {/* The same card whether it is still being written or finished: the text
        just stops growing. */}
      {turn.answer ? (
        <div className="mt-7 rounded-xl border border-hairline bg-panel px-5 py-4">
          <p className="text-[12px] tracking-wide text-faint uppercase">
            {companyName || "La empresa"}
          </p>
          <Markdown className="mt-2 text-[14px] text-ink">
            {turn.answer}
          </Markdown>
        </div>
      ) : null}

      {tokens > 0 ? (
        <p className="mt-3 px-1 text-[12px] text-faint">
          {formatTokens(tokens)} tokens · {formatCost(usage.cost)}
          {cacheHit > 0 ? ` · ${cacheHit}% desde caché` : ""}
        </p>
      ) : null}
    </div>
  );
}

export default function Conversation({
  companyName,
  turns,
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
  onCut,
}: ConversationProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  // Once it starts writing it has stopped reasoning, and the answer says more.
  const thinking = live.answer ? "" : live.thinking;
  const text = answer ?? live.answer;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, trace.length, thinking.length, text, error]);

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
          {turns.length === 0 && task === null ? (
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
            <div className="flex flex-col gap-12">
              {turns.map((turn, index) => (
                <Exchange key={index} companyName={companyName} turn={turn} />
              ))}
              {task !== null ? (
                <Exchange
                  companyName={companyName}
                  turn={{ task, answer: text, steps: trace, usage }}
                  live={{ thinking, running, error }}
                />
              ) : null}
            </div>
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
              placeholder={
                turns.length > 0 || task !== null
                  ? "Seguí sobre lo mismo, o pedí otra cosa."
                  : "Armá el plan para entrar al mercado mexicano el próximo trimestre."
              }
              className="min-w-0 flex-1 resize-none bg-transparent text-[14px] leading-relaxed text-ink outline-none placeholder:text-faint"
            />
            {running ? (
              <>
                {/* Reading it is not the same as running it, so a corrida you
                  only follow can be left alone or ended outright. */}
                {watching ? (
                  <Button onClick={onStop}>Dejar de seguir</Button>
                ) : null}
                <Button variant="danger" onClick={onCut}>
                  Cortar
                </Button>
              </>
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
