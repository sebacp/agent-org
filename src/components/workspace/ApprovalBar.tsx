import { useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import SourceIcon from "@/components/ui/SourceIcon";
import type { PendingWrite } from "@/lib/guard-types";

/**
 * A corrida stopped mid-call, waiting. It sits over whatever tab is open
 * instead of inside the conversation, because the corrida asking is often one
 * with no conversation on screen: an automation fires on its own and the write
 * it wants to make is still yours to allow.
 */
function Card({
  write,
  onAnswer,
}: {
  write: PendingWrite;
  onAnswer: (id: string, ok: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article className="pointer-events-auto w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-hairline bg-panel shadow-lg shadow-black/50">
      <div className="flex items-start gap-2.5 px-4 pt-3.5">
        <Avatar seed={write.agentId} size={22} className="mt-px" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug text-ink">
            {write.role || "Un agente"} quiere ejecutar{" "}
            <span className="font-mono text-[12px]">{write.tool}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
            <SourceIcon
              label={write.source.label}
              url={write.source.url}
              size={12}
            />
            {write.source.label}
            {/* The only line here that is not about what it wants to do: this
              one writes, and nothing on the way back would undo it. */}
            <span className="text-warn">· escribe</span>
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 px-4 text-[11px] text-faint underline decoration-hairline underline-offset-2 transition-colors hover:text-ink"
      >
        {open ? "ocultar lo que manda" : "ver lo que manda"}
      </button>
      {open ? (
        <pre className="mx-4 mt-1.5 max-h-56 overflow-auto rounded-lg border border-hairline bg-canvas px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-dim">
          {write.args}
        </pre>
      ) : null}

      <div className="mt-3 flex items-center gap-2 border-t border-hairline px-4 py-2.5">
        <p className="min-w-0 flex-1 text-[11px] text-faint">
          Si no contestás, no se ejecuta.
        </p>
        <Button onClick={() => onAnswer(write.id, false)}>Rechazar</Button>
        <Button variant="primary" onClick={() => onAnswer(write.id, true)}>
          Autorizar
        </Button>
      </div>
    </article>
  );
}

export default function ApprovalBar({
  approvals,
  onAnswer,
}: {
  approvals: PendingWrite[];
  onAnswer: (id: string, ok: boolean) => void;
}) {
  if (approvals.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2">
      {approvals.map((write) => (
        <Card key={write.id} write={write} onAnswer={onAnswer} />
      ))}
    </div>
  );
}
