import Button from "@/components/ui/Button";
import { STEPS, type Step } from "@/hooks/useOrgGraph";

interface EditorBarProps {
  company: string;
  step: Step;
  /** Areas and people belong to a company, so it needs a name first. */
  unlocked: boolean;
  onGo: (step: Step) => void;
  onLibrary: () => void;
  onDone: () => void;
}

export default function EditorBar({
  company,
  step,
  unlocked,
  onGo,
  onLibrary,
  onDone,
}: EditorBarProps) {
  return (
    <header className="flex items-center gap-3 border-b border-hairline bg-chrome px-4 py-2">
      <button
        type="button"
        onClick={onLibrary}
        className="shrink-0 text-[12px] text-faint transition-colors hover:text-ink"
      >
        ‹ Empresas
      </button>

      <span className="hidden max-w-[200px] min-w-0 truncate text-[14px] font-medium text-ink sm:block">
        {company || "Sin nombre"}
      </span>

      <nav className="flex min-w-0 flex-1 flex-wrap gap-1">
        {STEPS.map((item) => {
          const id = item.id as Step;
          const reachable = unlocked || id === 1;

          return (
            <button
              key={id}
              type="button"
              disabled={!reachable}
              onClick={() => onGo(id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                step === id
                  ? "bg-raised text-ink"
                  : reachable
                    ? "text-dim hover:bg-raised/60 hover:text-ink"
                    : "cursor-default text-faint opacity-40"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <Button variant="primary" onClick={onDone}>
        Listo
      </Button>
    </header>
  );
}
