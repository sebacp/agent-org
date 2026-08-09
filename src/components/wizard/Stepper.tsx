import { STEPS, type Step } from "@/hooks/useOrgGraph";

interface StepperProps {
  step: Step;
  unlocked: boolean;
  onGo: (step: Step) => void;
  onLibrary: () => void;
}

export default function Stepper({
  step,
  unlocked,
  onGo,
  onLibrary,
}: StepperProps) {
  return (
    <header className="border-b border-hairline bg-chrome">
      <div className="mx-auto flex w-full max-w-[980px] items-center gap-4 px-6 py-3.5">
        <button
          type="button"
          onClick={onLibrary}
          className="flex shrink-0 items-center gap-1.5 text-[13px] text-dim transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3">
            <path
              d="M7.2 2.5 3.6 6l3.6 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Empresas
        </button>

        <span className="h-5 w-px shrink-0 bg-hairline" />

        <nav className="flex min-w-0 flex-1 items-center">
        {STEPS.map((item, index) => {
          const id = item.id as Step;
          const done = id < step;
          const current = id === step;
          const reachable = unlocked || id === 1;

          return (
            <div key={id} className="flex min-w-0 flex-1 items-center last:flex-none">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onGo(id)}
                className={`flex items-center gap-2 rounded-lg py-1 pr-2 transition-opacity ${
                  reachable ? "hover:opacity-70" : "cursor-default opacity-40"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] transition-colors ${
                    current || done
                      ? "bg-ink text-white"
                      : "border border-hairline bg-panel text-faint"
                  }`}
                >
                  {done ? (
                    <svg viewBox="0 0 12 12" className="h-3 w-3">
                      <path
                        d="M2.5 6.2 4.8 8.5 9.5 3.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    id
                  )}
                </span>
                <span
                  className={`hidden truncate text-[13px] sm:block ${
                    current ? "text-ink" : "text-dim"
                  }`}
                >
                  {item.label}
                </span>
              </button>

              {index < STEPS.length - 1 ? (
                <span className="mx-1 h-px min-w-3 flex-1 bg-hairline" />
              ) : null}
            </div>
          );
        })}
        </nav>
      </div>
    </header>
  );
}
