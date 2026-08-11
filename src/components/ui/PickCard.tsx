import type { ReactNode } from "react";

export function CheckMark({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
        active ? "border-ink bg-ink" : "border-hairline bg-canvas"
      }`}
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
        <path
          d="M2.5 6.2 4.8 8.5 9.5 3.8"
          fill="none"
          stroke={active ? "var(--color-on-ink)" : "transparent"}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

interface PickCardProps {
  active: boolean;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  /** Sits between the check and the title, for an avatar. */
  media?: ReactNode;
  locked?: boolean;
  onClick: () => void;
}

export default function PickCard({
  active,
  title,
  subtitle,
  badge,
  media,
  locked = false,
  onClick,
}: PickCardProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={locked}
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border bg-panel p-4 text-left transition-colors ${
        active ? "border-ink" : "border-hairline hover:border-faint"
      } ${locked ? "cursor-default opacity-70" : ""}`}
    >
      <CheckMark active={active} />
      {media}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[15px] leading-snug font-medium text-ink">
            {title}
          </span>
          {badge}
        </span>
        {subtitle ? (
          <span className="mt-1 block text-[13px] leading-relaxed text-dim">
            {subtitle}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-raised px-2 py-0.5 text-[12px] text-dim">
      {children}
    </span>
  );
}
