import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-on-ink hover:opacity-90",
  secondary:
    "border border-hairline bg-panel text-ink hover:bg-raised disabled:hover:bg-panel",
  ghost:
    "text-dim hover:bg-raised hover:text-ink disabled:hover:bg-transparent",
  danger: "text-danger hover:bg-danger-soft disabled:hover:bg-transparent",
};

const SIZES: Record<Size, string> = {
  /** For actions that live inside a card, where `md` crowds the text. */
  sm: "rounded-md px-2.5 py-1 text-[13px]",
  md: "rounded-lg px-3.5 py-2 text-[14px]",
  lg: "rounded-xl px-5 py-2.5 text-[15px] font-medium",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export default function Button({
  variant = "ghost",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
