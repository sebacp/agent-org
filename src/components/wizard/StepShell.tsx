import type { ReactNode } from "react";
import Button from "@/components/ui/Button";

interface StepShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  footerNote?: ReactNode;
}

export default function StepShell({
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = "Continuar",
  nextDisabled = false,
  footerNote,
}: StepShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[640px] px-6 pt-12 pb-10">
          <h1 className="text-[27px] leading-tight font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-dim">
            {subtitle}
          </p>
          <div className="mt-9">{children}</div>
        </div>
      </div>

      <footer className="border-t border-hairline bg-chrome">
        <div className="mx-auto flex w-full max-w-[640px] items-center gap-4 px-6 py-4">
          {onBack ? (
            <Button onClick={onBack} size="lg">
              Atrás
            </Button>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[13px] text-faint">
            {footerNote}
          </span>
          <Button
            variant="primary"
            size="lg"
            disabled={nextDisabled}
            onClick={onNext}
          >
            {nextLabel}
          </Button>
        </div>
      </footer>
    </div>
  );
}
