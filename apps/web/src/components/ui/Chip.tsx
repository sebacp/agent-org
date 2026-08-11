interface ChipProps {
  on: boolean;
  label: string;
  /** Shown in a lighter weight after the label, for a hint like "escribe". */
  note?: string;
  title?: string;
  onClick: () => void;
}

export default function Chip({ on, label, note, title, onClick }: ChipProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[13px] transition-colors ${
        on
          ? "border-ink/30 bg-raised text-ink"
          : "border-hairline text-faint hover:text-ink"
      }`}
    >
      {label}
      {note ? <span className="ml-1.5 text-faint">{note}</span> : null}
    </button>
  );
}
