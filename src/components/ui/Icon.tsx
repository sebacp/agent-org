import type { ReactNode } from "react";

const SHAPES = {
  org: (
    <>
      <rect x="5.5" y="1.75" width="5" height="4" rx="1" />
      <rect x="1" y="10.25" width="5" height="4" rx="1" />
      <rect x="10" y="10.25" width="5" height="4" rx="1" />
      <path d="M8 5.75V8M3.5 10.25V8h9v2.25" />
    </>
  ),
  tasks: (
    <>
      <path d="M2 9.5 3.6 2.9h8.8L14 9.5v3.1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
      <path d="M2 9.5h3.2l.9 1.6h3.8l.9-1.6H14" />
    </>
  ),
  library: (
    <>
      <path d="M4.4 1.5h8.9v13.1H4.4A1.7 1.7 0 0 1 2.7 12.9V3.2A1.7 1.7 0 0 1 4.4 1.5z" />
      <path d="M2.7 12.9a1.7 1.7 0 0 1 1.7-1.7h8.9" />
    </>
  ),
  automations: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 4.75V8l2.25 1.5" />
    </>
  ),
  doc: (
    <>
      <path d="M9.3 1.6H4.6a1.5 1.5 0 0 0-1.5 1.5v9.8a1.5 1.5 0 0 0 1.5 1.5h6.8a1.5 1.5 0 0 0 1.5-1.5V5.3z" />
      <path d="M9.3 1.6v3.7h3.6" />
      <path d="M5.8 8.9h4.4M5.8 11.2h3" />
    </>
  ),
  table: (
    <>
      <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="1.4" />
      <path d="M2.6 6.2h10.8M6.4 6.2v7.2" />
    </>
  ),
  image: (
    <>
      <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="1.4" />
      <circle cx="6.1" cy="6.1" r="1.1" />
      <path d="m2.6 11.1 3-2.8 3.2 3 1.6-1.4 3 2.6" />
    </>
  ),
  attachment: (
    <path d="M14.3 7.4 8.2 13.5a4 4 0 0 1-5.7-5.7l6.2-6.1a2.7 2.7 0 0 1 3.8 3.8l-6.2 6.1a1.3 1.3 0 0 1-1.9-1.9l5.7-5.6" />
  ),
  save: (
    <>
      <path d="M2.7 4.1a1.4 1.4 0 0 1 1.4-1.4h6.2l3 3V11.9a1.4 1.4 0 0 1-1.4 1.4H4.1a1.4 1.4 0 0 1-1.4-1.4z" />
      <path d="M5.5 2.7v3.1h4.1V2.7" />
      <path d="M5.5 13.3V9.7h5v3.6" />
    </>
  ),
  check: <path d="m3.4 8.4 3 3.1 6.2-6.9" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof SHAPES;

export default function Icon({
  name,
  size = 16,
}: {
  name: IconName;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {SHAPES[name]}
    </svg>
  );
}
