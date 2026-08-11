import { avatarUrl } from "@/lib/avatar";

interface AvatarProps {
  seed: string;
  size?: number;
  className?: string;
}

export default function Avatar({
  seed,
  size = 36,
  className = "",
}: AvatarProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a remote SVG has nothing for the optimizer to do
    <img
      src={avatarUrl(seed)}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full bg-raised ${className}`}
    />
  );
}
