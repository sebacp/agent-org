import { useState } from "react";
import { faviconUrl } from "@/lib/favicon";

interface SourceIconProps {
  label: string;
  /** Empty for a `stdio` source, which has no brand to look up. */
  url: string;
  size?: number;
}

export default function SourceIcon({ label, url, size = 20 }: SourceIconProps) {
  const src = faviconUrl(url);
  // The failed address rather than a flag, so editing the source tries again.
  const [failed, setFailed] = useState("");
  const broken = failed === src;

  const box = {
    width: size,
    height: size,
    borderRadius: Math.round(size / 4),
  };

  if (!src || broken) {
    return (
      <span
        aria-hidden
        style={{ ...box, fontSize: Math.round(size * 0.55) }}
        className="flex shrink-0 items-center justify-center bg-raised font-medium text-faint uppercase"
      >
        {label.trim().slice(0, 1) || "?"}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 16px remote icon has nothing for the optimizer to do
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(src)}
      style={box}
      className="shrink-0 bg-raised object-contain"
    />
  );
}
